type MiddlewareHandler = (context: unknown, next: () => Promise<Response>) => Promise<Response> | Response;

export function defineMiddleware(handler: MiddlewareHandler): MiddlewareHandler {
  return handler;
}
