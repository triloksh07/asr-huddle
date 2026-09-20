`pnpm` commands to typecheck each package and application independently:

### Applications (`apps/`)

* **`@repo/web`**
```bash
pnpm --filter @repo/web typecheck

```


* **`api`**
```bash
pnpm --filter api typecheck

```


* **`sfu-node`**
```bash
pnpm --filter sfu-node typecheck

```



---

### Workspace Packages (`packages/`)

* **`@repo/application`**
```bash
pnpm --filter @repo/application typecheck

```


* **`@repo/audio-config`**
```bash
pnpm --filter @repo/audio-config typecheck

```


* **`@repo/db`**
```bash
pnpm --filter @repo/db typecheck

```


* **`@repo/domain`**
```bash
pnpm --filter @repo/domain typecheck

```


* **`@repo/media-contract`**
```bash
pnpm --filter @repo/media-contract typecheck

```


* **`@repo/protocol`**
```bash
pnpm --filter @repo/protocol typecheck

```


* **`@repo/redis`**
```bash
pnpm --filter @repo/redis typecheck

```


* **`@repo/redis-models`**
```bash
pnpm --filter @repo/redis-models typecheck

```


* **`@repo/sfu-contract`**
```bash
pnpm --filter @repo/sfu-contract typecheck

```


* **`@repo/state-machine`**
```bash
pnpm --filter @repo/state-machine typecheck

```


* **`@repo/tsconfig`**
```bash
pnpm --filter @repo/tsconfig typecheck

```

