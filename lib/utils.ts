import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL;
export const UPLOAD_TOKEN = process.env.NEXT_PUBLIC_UPLOAD_TOKEN;