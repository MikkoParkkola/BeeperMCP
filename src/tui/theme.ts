export type ThemeName = 'dark' | 'light' | 'high-contrast';

export interface ThemePalette {
  bg: string;
  fg: string;
  accent: string;
  warning: string;
  error: string;
  listSelectedBg: string;
  listSelectedFg: string;
  highlight: string;
  dim: string;
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    bg: 'black',
    fg: 'white',
    accent: 'blue',
    warning: 'yellow',
    error: 'red',
    listSelectedBg: 'cyan',
    listSelectedFg: 'black',
    highlight: 'magenta',
    dim: 'gray',
  },
  light: {
    bg: 'white',
    fg: 'black',
    accent: 'blue',
    warning: 'yellow',
    error: 'red',
    listSelectedBg: 'blue',
    listSelectedFg: 'white',
    highlight: 'blue',
    dim: 'gray',
  },
  'high-contrast': {
    bg: 'black',
    fg: 'white',
    accent: 'green',
    warning: 'yellow',
    error: 'red',
    listSelectedBg: 'white',
    listSelectedFg: 'black',
    highlight: 'yellow',
    dim: 'gray',
  },
};

export interface MinimalConfigShape {
  settings?: {
    theme?: ThemeName;
    customTheme?: Partial<ThemePalette>;
    [k: string]: unknown;
  };
}

export function getTheme(cfg: MinimalConfigShape): ThemePalette {
  const name = (cfg.settings?.theme as ThemeName) || 'dark';
  const base = THEMES[name] || THEMES.dark;
  const custom = cfg.settings?.customTheme || {};
  return { ...base, ...custom } as ThemePalette;
}

export function setTheme(
  cfg: MinimalConfigShape,
  name: ThemeName,
): MinimalConfigShape {
  cfg.settings = cfg.settings || {};
  (cfg.settings as any).theme = name;
  return cfg;
}

export function setPaletteColor(
  cfg: MinimalConfigShape,
  key: keyof ThemePalette,
  value: string,
): MinimalConfigShape {
  cfg.settings = cfg.settings || {};
  const ct = (cfg.settings as any).customTheme || {};
  (cfg.settings as any).customTheme = { ...ct, [key]: value };
  return cfg;
}

export function applyThemeToWidgets(
  theme: ThemePalette,
  widgets: {
    status: any;
    list: any;
    messages: any;
    side: any;
    input: any;
  },
) {
  try {
    widgets.status.style = { fg: theme.fg, bg: theme.accent } as any;
    widgets.list.style = widgets.list.style || {};
    widgets.list.style.selected = {
      bg: theme.listSelectedBg,
      fg: theme.listSelectedFg,
    } as any;
    widgets.messages.style = { fg: theme.fg, bg: theme.bg } as any;
    widgets.side.style = { fg: theme.fg, bg: theme.bg } as any;
    widgets.input.style = { fg: theme.fg, bg: theme.bg } as any;
  } catch {}
}
