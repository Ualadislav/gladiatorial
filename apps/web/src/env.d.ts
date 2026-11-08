interface TelegramWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes(): void;
  initData: string;
  initDataUnsafe?: {
    user?: {
      first_name?: string;
      username?: string;
    };
  };
  themeParams?: {
    bg_color?: string;
  };
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
