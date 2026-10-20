export interface HttpResponse {
  url: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  truncated: boolean;
  responseTimeMs: number;
}

export type NetworkFailureKind = 'timeout' | 'connection' | 'dns' | 'blocked' | 'other';

export interface NetworkFailure {
  url: string;
  kind: NetworkFailureKind;
  message: string;
}

export const isNetworkFailure = (result: HttpResponse | NetworkFailure): result is NetworkFailure =>
  'kind' in result;

export interface HttpClient {
  get(url: string): Promise<HttpResponse | NetworkFailure>;
}
