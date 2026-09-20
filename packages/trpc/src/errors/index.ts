/**
 * Central error-mapping boundary.
 *
 * ApplicationError -> tRPC error translation is implemented once the
 * application router procedures exist; individual procedures must not grow
 * their own error-mapping logic.
 */
export type TRPCErrorMapper = (error: unknown) => unknown;
