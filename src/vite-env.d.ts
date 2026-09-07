/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name: string; username?: string }; start_param?: string };
  ready(): void;
  expand(): void;
  close(): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  openTelegramLink?(url: string): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
}

interface Window { Telegram?: { WebApp: TelegramWebApp } }
