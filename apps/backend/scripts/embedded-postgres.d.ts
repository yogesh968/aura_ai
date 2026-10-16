// Minimal typing for the ESM-only `embedded-postgres` package (its bundled
// types are not resolvable under this package's CommonJS module resolution).
declare module 'embedded-postgres' {
  interface PostgresOptions {
    databaseDir: string;
    port: number;
    user: string;
    password: string;
    persistent: boolean;
    onLog: (message: string) => void;
  }
  export default class EmbeddedPostgres {
    constructor(options?: Partial<PostgresOptions>);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
  }
}
