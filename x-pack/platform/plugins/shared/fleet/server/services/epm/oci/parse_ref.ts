/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OciPackageRef } from './types';

const OCI_REF_PATTERN = /^(?:(https?):\/\/)?([^/]+)\/(.+):([^:]+)$/;

export const parseOciRef = (ref: string): OciPackageRef & { registryUrl: string } => {
  const trimmedRef = ref.trim();
  const match = trimmedRef.match(OCI_REF_PATTERN);

  if (!match) {
    throw new Error(`Invalid OCI reference: ${ref}`);
  }

  const [, scheme, host, repository, tag] = match;
  const registryUrl = scheme ? `${scheme}://${host}` : `http://${host}`;

  return {
    registryUrl,
    repository,
    tag,
  };
};

export const formatOciRef = ({
  registryUrl,
  repository,
  tag,
}: {
  registryUrl: string;
  repository: string;
  tag: string;
}): string => {
  const parsedRegistryUrl = new URL(registryUrl);
  const hostWithPort = parsedRegistryUrl.host;
  return `${hostWithPort}/${repository}:${tag}`;
};
