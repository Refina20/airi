import type { ChatProvider } from '../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'
import { DEFAULT_BASE_URL } from './shared'

/**
 * Session key for OpenClaw Gateway x-openclaw-session-key header.
 * Using a fixed key so all Airi requests share the same subagent session,
 * enabling conversation memory across turns.
 */
const OPENCLAW_SESSION_KEY = 'airi-openclaw-session'

const openClawConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .default(DEFAULT_BASE_URL),
})

type OpenClawConfig = z.input<typeof openClawConfigSchema>

export const providerOpenClaw = defineProvider<OpenClawConfig>({
  id: 'openclaw-provider',
  order: 1,
  name: 'OpenClaw (Tina)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openclaw.title'),
  description: 'OpenClaw AI backend powered by Tina (virtual assistant).',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openclaw.description'),
  tasks: ['text-generation'],
  icon: 'i-ph:robot',

  requiresCredentials: false,

  createProviderConfig: ({ t }) => openClawConfigSchema.extend({
    apiKey: openClawConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openClawConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const baseProvider = createOpenAI(config.apiKey as string, config.baseUrl)

    // Wrap the chat method to inject the x-openclaw-session-key header.
    // This makes all Airi requests share the same OpenClaw subagent session,
    // enabling conversation memory across turns.
    const originalChat = baseProvider.chat.bind(baseProvider)
    return {
      ...baseProvider,
      chat(model: string) {
        const chatOptions = originalChat(model)
        return {
          ...chatOptions,
          headers: {
            ...chatOptions.headers,
            'x-openclaw-session-key': OPENCLAW_SESSION_KEY,
          },
        }
      },
    } as ChatProvider
  },

  validationRequiredWhen: () => false,

  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
      skipApiKeyCheck: true,
      schedule: {
        mode: 'interval',
        intervalMs: 15_000,
      },
      connectivityFailureReason: ({ errorMessage }) =>
        `Failed to reach OpenClaw (GX10) server, error: ${errorMessage} occurred.\n\nMake sure GX10 vLLM is running at ${DEFAULT_BASE_URL}.`,
      modelListFailureReason: ({ errorMessage }) =>
        `Failed to fetch model list from GX10, error: ${errorMessage} occurred.\n\nEnsure GX10 vLLM is running and accessible.`,
    }),
  },
})
