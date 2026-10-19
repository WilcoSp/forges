import type { ProviderFactoryFunction } from '../define.ts'
import type { ForgejoOptions } from './definition.ts'
import { defineForgeProvider } from '../define.ts'
import { FORGEJO_PROFILE, forgejoDefinition } from './definition.ts'

export type { ForgejoAuth, ForgejoOptions } from './definition.ts'

/** Creates a Forgejo provider for Codeberg or any self-hosted Forgejo instance. */
export const forgejo: ProviderFactoryFunction<ForgejoOptions, true, 'forgejo'> = /* @__PURE__ */ defineForgeProvider(/* @__PURE__ */ forgejoDefinition(FORGEJO_PROFILE))
