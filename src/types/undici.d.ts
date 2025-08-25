declare module 'undici' {
  export const ProxyAgent: any;
  export function setGlobalDispatcher(agent: any): void;
}
