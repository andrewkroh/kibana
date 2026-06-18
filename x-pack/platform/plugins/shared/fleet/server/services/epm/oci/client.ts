/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import type { RequestInit, Response } from 'node-fetch';
import fetch from 'node-fetch';

import { getFetchOptions } from '../registry/requests';
import { getRegistryProxyUrl, getProxyAgent } from '../registry/proxy';
import type { Agent as HttpAgent } from 'http';
import type { Agent as HttpsAgent } from 'https';
import { appContextService } from '../../app_context';

import { getOciRegistryConfig } from './config';
import { formatOciRef, parseOciRef } from './parse_ref';
import {
  OciRegistryConnectionError,
  OciRegistryError,
  OciRegistryResponseError,
} from '../../../errors';
import type {
  OciManifest,
  OciManifestLayer,
  OciPackageListItem,
  OciPackageRef,
  OciPulledPackage,
} from './types';

const MAX_ARCHIVE_BYTES = 104857600; // 100MB

const MANIFEST_ACCEPT_HEADER =
  'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.oci.artifact.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';

const ZIP_LAYER_MEDIA_TYPES = new Set([
  'application/zip',
  'application/vnd.elastic.fleet.integration.v1+zip',
  'application/vnd.docker.container.image.v1+json',
]);

const getAuthHeader = (username?: string, password?: string): string | undefined => {
  if (!username) {
    return undefined;
  }
  return `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}`;
};

const getOciFetchOptions = (targetUrl: string, accept?: string): RequestInit => {
  const options = getFetchOptions(targetUrl) ?? {};
  const ociConfig = getOciRegistryConfig();
  const authHeader = getAuthHeader(ociConfig?.username, ociConfig?.password);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (accept) {
    headers.Accept = accept;
  }

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const proxyUrl = getRegistryProxyUrl();
  if (proxyUrl) {
    options.agent = getProxyAgent({ proxyUrl, targetUrl }) as unknown as HttpAgent | HttpsAgent;
  }

  return {
    ...options,
    headers,
    redirect: 'follow',
  };
};

const ociFetch = async (url: string, accept?: string): Promise<Response> => {
  const response = await fetch(url, getOciFetchOptions(url, accept));

  if (response.ok) {
    return response;
  }

  const message = `'${response.status} ${response.statusText}' error response from OCI registry at ${url}`;
  throw new OciRegistryResponseError(message, response.status);
};

const buildRegistryUrl = (registryUrl: string, path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${registryUrl.replace(/\/$/, '')}${normalizedPath}`;
};

const encodeRepository = (repository: string): string => {
  return repository
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const getManifestUrl = (registryUrl: string, repository: string, tag: string): string => {
  return buildRegistryUrl(registryUrl, `/v2/${encodeRepository(repository)}/manifests/${tag}`);
};

const getBlobUrl = (registryUrl: string, repository: string, digest: string): string => {
  return buildRegistryUrl(registryUrl, `/v2/${encodeRepository(repository)}/blobs/${digest}`);
};

const parseManifest = async (response: Response): Promise<OciManifest> => {
  const manifest = (await response.json()) as OciManifest;

  if (manifest.manifests?.length) {
    const childManifest = manifest.manifests[0];
    const manifestUrl = response.url.replace(
      /\/manifests\/[^/]+$/,
      `/manifests/${childManifest.digest}`
    );
    const childResponse = await ociFetch(manifestUrl, MANIFEST_ACCEPT_HEADER);
    return parseManifest(childResponse);
  }

  return manifest;
};

const getZipLayer = (manifest: OciManifest): OciManifestLayer | undefined => {
  const layers = manifest.layers ?? [];
  return (
    layers.find((layer) => ZIP_LAYER_MEDIA_TYPES.has(layer.mediaType)) ??
    (layers.length === 1 ? layers[0] : undefined)
  );
};

const validateDigest = (buffer: Buffer, digest: string): void => {
  const [algorithm, expectedHash] = digest.split(':');
  if (algorithm !== 'sha256' || !expectedHash) {
    throw new OciRegistryError(`Unsupported digest algorithm: ${digest}`);
  }

  const actualHash = createHash('sha256').update(buffer).digest('hex');
  if (actualHash !== expectedHash) {
    throw new OciRegistryError(`OCI blob digest mismatch for ${digest}`);
  }
};

const getManifestMetadata = (manifest: OciManifest, repository: string, tag: string) => {
  const annotations = {
    ...(manifest.annotations ?? {}),
    ...(manifest.layers?.[0]?.annotations ?? {}),
  };

  const repositoryName = repository.split('/').pop() ?? repository;

  return {
    title: annotations['org.opencontainers.image.title'] ?? repositoryName,
    description: annotations['org.opencontainers.image.description'],
    digest: getZipLayer(manifest)?.digest,
    tag: annotations['org.opencontainers.image.version'] ?? tag,
  };
};

const resolvePackageRef = (
  input: { ref?: string } & Partial<OciPackageRef>
): { registryUrl: string; repository: string; tag: string; ref: string } => {
  const ociConfig = getOciRegistryConfig();
  if (!ociConfig) {
    throw new OciRegistryError('OCI registry is not configured');
  }

  if (input.ref) {
    const parsedRef = parseOciRef(input.ref);
    return {
      ...parsedRef,
      ref: input.ref,
    };
  }

  if (!input.repository || !input.tag) {
    throw new OciRegistryError('Either ref or repository and tag must be provided');
  }

  return {
    registryUrl: ociConfig.url,
    repository: input.repository,
    tag: input.tag,
    ref: formatOciRef({
      registryUrl: ociConfig.url,
      repository: input.repository,
      tag: input.tag,
    }),
  };
};

export const listOciPackages = async (): Promise<OciPackageListItem[]> => {
  const ociConfig = getOciRegistryConfig();
  if (!ociConfig) {
    throw new OciRegistryError('OCI registry is not configured');
  }

  const logger = appContextService.getLogger();

  try {
    const catalogResponse = await ociFetch(buildRegistryUrl(ociConfig.url, '/v2/_catalog?n=1000'));
    const catalog = (await catalogResponse.json()) as { repositories?: string[] };
    const namespacePrefix = `${ociConfig.namespace.replace(/\/$/, '')}/`;
    const repositories = (catalog.repositories ?? []).filter((repository) =>
      repository.startsWith(namespacePrefix)
    );

    const items: OciPackageListItem[] = [];

    for (const repository of repositories) {
      const tagsResponse = await ociFetch(
        buildRegistryUrl(ociConfig.url, `/v2/${encodeRepository(repository)}/tags/list`)
      );
      const tagsPayload = (await tagsResponse.json()) as { tags?: string[] };
      const tags = tagsPayload.tags ?? [];

      for (const tag of tags) {
        try {
          const manifestResponse = await ociFetch(
            getManifestUrl(ociConfig.url, repository, tag),
            MANIFEST_ACCEPT_HEADER
          );
          const manifest = await parseManifest(manifestResponse);
          const metadata = getManifestMetadata(manifest, repository, tag);

          items.push({
            repository,
            tag,
            ref: formatOciRef({
              registryUrl: ociConfig.url,
              repository,
              tag,
            }),
            title: metadata.title,
            description: metadata.description,
            digest: metadata.digest,
          });
        } catch (error) {
          logger.warn(`Failed to fetch OCI manifest for ${repository}:${tag}: ${error}`);
        }
      }
    }

    return items.sort((left, right) => {
      const leftKey = `${left.repository}:${left.tag}`;
      const rightKey = `${right.repository}:${right.tag}`;
      return leftKey.localeCompare(rightKey);
    });
  } catch (error) {
    if (error instanceof OciRegistryError) {
      throw error;
    }
    throw new OciRegistryConnectionError(`Error connecting to OCI registry: ${error}`);
  }
};

export const pullOciPackage = async (
  input: { ref?: string } & Partial<OciPackageRef>
): Promise<OciPulledPackage> => {
  const resolvedRef = resolvePackageRef(input);

  try {
    const manifestResponse = await ociFetch(
      getManifestUrl(resolvedRef.registryUrl, resolvedRef.repository, resolvedRef.tag),
      MANIFEST_ACCEPT_HEADER
    );
    const manifest = await parseManifest(manifestResponse);
    const zipLayer = getZipLayer(manifest);

    if (!zipLayer) {
      throw new OciRegistryError(
        `OCI manifest for ${resolvedRef.ref} does not contain a zip artifact layer`
      );
    }

    const blobResponse = await ociFetch(
      getBlobUrl(resolvedRef.registryUrl, resolvedRef.repository, zipLayer.digest)
    );
    const archiveBuffer = Buffer.from(await blobResponse.arrayBuffer());

    if (archiveBuffer.byteLength > MAX_ARCHIVE_BYTES) {
      throw new OciRegistryError(
        `OCI artifact for ${resolvedRef.ref} exceeds the maximum allowed size of ${MAX_ARCHIVE_BYTES} bytes`
      );
    }

    validateDigest(archiveBuffer, zipLayer.digest);

    return {
      archiveBuffer,
      contentType: 'application/zip',
      ref: resolvedRef.ref,
      repository: resolvedRef.repository,
      tag: resolvedRef.tag,
    };
  } catch (error) {
    if (error instanceof OciRegistryError) {
      throw error;
    }
    throw new OciRegistryConnectionError(`Error pulling OCI package ${resolvedRef.ref}: ${error}`);
  }
};
