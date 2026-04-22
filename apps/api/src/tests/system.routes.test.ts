describe('system routes', () => {
  it('returns health status without hitting external integrations', async () => {
    const { systemRouter } = await import('../modules/system/system.routes');
    const response = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
      const req = {
        method: 'GET',
        url: '/health',
        originalUrl: '/health',
        headers: {},
        header: () => undefined,
      };

      const res = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
          this.headers[name] = value;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          resolve({ statusCode: this.statusCode, body: payload });
          return this;
        },
      };

      systemRouter.handle(req, res, (error: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ statusCode: res.statusCode, body: null });
      });
    });

    expect(response.statusCode).toBe(200);
    expect((response.body as { status: string }).status).toBe('ok');
  });
});
