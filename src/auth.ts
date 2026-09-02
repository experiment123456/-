export type AccountSettings = {
  backgroundAutoplay: boolean;
  ripplesEnabled: boolean;
  reducedMotion: boolean;
};

export type AccountUser = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
  settings: AccountSettings;
};

export type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  at: string;
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload;
}
