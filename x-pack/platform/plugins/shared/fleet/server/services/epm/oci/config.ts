/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appContextService } from '../../app_context';

export const DEFAULT_OCI_REGISTRY_NAMESPACE = 'fleet/integrations';

export interface OciRegistryConfig {
  url: string;
  namespace: string;
  username?: string;
  password?: string;
}

export const getOciRegistryConfig = (): OciRegistryConfig | undefined => {
  const ociRegistry = appContextService.getConfig()?.ociRegistry;
  if (!ociRegistry?.url) {
    return undefined;
  }

  return {
    url: ociRegistry.url.replace(/\/$/, ''),
    namespace: ociRegistry.namespace ?? DEFAULT_OCI_REGISTRY_NAMESPACE,
    username: ociRegistry.username,
    password: ociRegistry.password,
  };
};
