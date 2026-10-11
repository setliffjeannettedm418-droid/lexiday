import type { ThemeStyle } from "../../types";

export const themeStyles = [
  { id: "apricot", name: "暖杏手账", description: "暖白纸感，柔和杏棕" },
  { id: "paper", name: "墨白书页", description: "黑白留白，专注阅读" },
  { id: "aurora", name: "极光蓝", description: "蓝紫光影，清爽通透" },
] as const satisfies readonly { id: ThemeStyle; name: string; description: string }[];

export function normalizeThemeStyle(value: unknown): ThemeStyle {
  return themeStyles.find((style) => style.id === value)?.id ?? "apricot";
}
