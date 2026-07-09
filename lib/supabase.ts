/**
 * Supabase 客户端
 *
 * 两个客户端：
 * 1. 浏览器端（anon key，受限权限）
 * 2. 服务端（service role key，完整权限）
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * 浏览器端客户端（anon key）
 * 用于：用户认证、读取公开数据
 */
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * 服务端客户端（service role key）
 * 用于：写入数据、绕过 RLS
 * 只在 API Routes / Server Actions 中使用
 */
export function createServerClient() {
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * 单例模式的服务端客户端
 */
let serverClient: ReturnType<typeof createServerClient> | null = null;

export function getServerClient() {
  if (!serverClient) {
    serverClient = createServerClient();
  }
  return serverClient;
}
