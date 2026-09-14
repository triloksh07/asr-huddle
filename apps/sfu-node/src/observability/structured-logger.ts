export interface SfuLogFields {
  [key: string]: string | number | boolean | null | undefined;
}

export class SfuStructuredLogger {
  info(event: string, fields: SfuLogFields = {}): void {
    console.log(
      JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, ...fields })
    );
  }

  error(event: string, fields: SfuLogFields = {}): void {
    console.error(
      JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event, ...fields })
    );
  }
}
