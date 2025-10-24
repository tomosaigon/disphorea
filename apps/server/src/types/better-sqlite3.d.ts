declare module 'better-sqlite3' {
  // Minimal typing to satisfy TS without external @types.
  // You can replace this by installing @types/better-sqlite3 when network is available.
  class Database {
    constructor(filename?: string, options?: any)
    pragma(statement: string): void
    prepare<T = any>(sql: string): {
      run(params?: any): { changes: number; lastInsertRowid: any }
      all(...params: any[]): T[]
      get(...params: any[]): T
    }
    exec(sql: string): void
  }
  export default Database
}

