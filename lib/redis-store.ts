import net from 'node:net';
import tls from 'node:tls';

const restUrlVariables = ['KV_REST_API_URL', 'KV_REST_REDIS_URL', 'UPSTASH_REDIS_REST_URL'] as const;
const restTokenVariables = ['KV_REST_API_TOKEN', 'KV_REST_REDIS_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const redisUrlVariables = ['REDIS_URL', 'KV_URL', 'KV_REST_REDIS_URL', 'KV_REST_API_URL'] as const;

type RedisStatus = {
  hasKvUrl: boolean;
  hasKvToken: boolean;
  hasKvApiUrl: boolean;
  hasKvApiToken: boolean;
  hasKvRedisUrl: boolean;
  hasKvRedisToken: boolean;
  hasUpstashUrl: boolean;
  hasUpstashToken: boolean;
  hasRedisUrl: boolean;
  configured: boolean;
  mode: 'rest' | 'url' | 'none';
};

type RestConfig = { mode: 'rest'; url: string; token: string };
type UrlConfig = { mode: 'url'; url: string };
type RedisConfig = RestConfig | UrlConfig;

function envValue(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function isHttpUrl(value: string | undefined) {
  return Boolean(value?.startsWith('http://') || value?.startsWith('https://'));
}

function isRedisUrl(value: string | undefined) {
  return Boolean(value?.startsWith('redis://') || value?.startsWith('rediss://'));
}

function redisConfig(): RedisConfig | null {
  const restUrl = envValue(restUrlVariables);
  const restToken = envValue(restTokenVariables);
  if (isHttpUrl(restUrl) && restToken) return { mode: 'rest', url: restUrl!, token: restToken };

  const redisUrl = envValue(redisUrlVariables);
  if (isRedisUrl(redisUrl)) return { mode: 'url', url: redisUrl! };

  return null;
}

export function redisPersistenceConfigured() {
  return Boolean(redisConfig());
}

export function redisEnvStatus(): RedisStatus {
  const hasKvApiUrl = Boolean(process.env.KV_REST_API_URL);
  const hasKvApiToken = Boolean(process.env.KV_REST_API_TOKEN);
  const hasKvRedisUrl = Boolean(process.env.KV_REST_REDIS_URL);
  const hasKvRedisToken = Boolean(process.env.KV_REST_REDIS_TOKEN);
  const hasUpstashUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const hasUpstashToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasRedisUrl = Boolean(process.env.REDIS_URL || process.env.KV_URL || [process.env.KV_REST_REDIS_URL, process.env.KV_REST_API_URL].some(isRedisUrl));
  const config = redisConfig();

  return {
    hasKvUrl: hasKvApiUrl || hasKvRedisUrl,
    hasKvToken: hasKvApiToken || hasKvRedisToken,
    hasKvApiUrl,
    hasKvApiToken,
    hasKvRedisUrl,
    hasKvRedisToken,
    hasUpstashUrl,
    hasUpstashToken,
    hasRedisUrl,
    configured: Boolean(config),
    mode: config?.mode ?? 'none',
  };
}

function encodeCommand(command: unknown[]) {
  const parts = command.map((item) => String(item));
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
}

function parseRespValues(input: string): unknown[] {
  let offset = 0;
  const values: unknown[] = [];

  function readLine() {
    const next = input.indexOf('\r\n', offset);
    if (next === -1) throw new Error('Invalid Redis response');
    const line = input.slice(offset, next);
    offset = next + 2;
    return line;
  }

  function parseValue(): unknown {
    const prefix = input[offset++];
    if (prefix === '+') return readLine();
    if (prefix === '-') throw new Error(readLine());
    if (prefix === ':') return Number(readLine());
    if (prefix === '$') {
      const length = Number(readLine());
      if (length === -1) return null;
      const value = input.slice(offset, offset + length);
      offset += length + 2;
      return value;
    }
    if (prefix === '*') {
      const length = Number(readLine());
      if (length === -1) return null;
      return Array.from({ length }, parseValue);
    }
    throw new Error('Unsupported Redis response');
  }

  while (offset < input.length) values.push(parseValue());
  return values;
}

async function redisUrlCommand<T>(urlValue: string, command: unknown[]): Promise<T | null> {
  const parsed = new URL(urlValue);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'rediss:' ? 6380 : 6379;
  const socket = parsed.protocol === 'rediss:'
    ? tls.connect({ host: parsed.hostname, port, servername: parsed.hostname })
    : net.connect({ host: parsed.hostname, port });

  return await new Promise<T | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Redis connection timed out'));
    }, 5000);

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

    socket.on('end', () => {
      clearTimeout(timeout);
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const responses = parseRespValues(raw);
        const commandResponseIndex = parsed.password ? 1 : 0;
        resolve((responses[commandResponseIndex] ?? null) as T | null);
      } catch (error) {
        reject(error);
      }
    });

    socket.on('connect', () => {
      const commands: string[] = [];
      if (parsed.password) commands.push(encodeCommand(['AUTH', decodeURIComponent(parsed.username || 'default'), decodeURIComponent(parsed.password)]));
      commands.push(encodeCommand(command));
      commands.push(encodeCommand(['QUIT']));
      socket.write(commands.join(''));
    });
  });
}

export async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  if (config.mode === 'url') return await redisUrlCommand<T>(config.url, command);

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Prediction store failed with ${response.status}`);
  const payload = await response.json() as { result: T | null };
  return payload.result;
}
