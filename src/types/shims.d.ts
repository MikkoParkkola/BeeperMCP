declare module 'json-schema' {
  export interface JSONSchema7 {
    [key: string]: any;
  }
}

declare module 'pg' {
  export class Pool {
    constructor(opts?: any);
    query<T = any>(sql: string, args?: any[]): Promise<{ rows: T[] }>;
    end?: () => Promise<void>;
  }
}

declare module 'pino' {
  const pino: any;
  export default pino;
}

declare namespace Pino {
  interface Logger {
    [key: string]: any;
  }
}

declare module 'luxon' {
  export const DateTime: any;
}
