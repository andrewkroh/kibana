/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';

import fetch from 'node-fetch';

import { appContextService } from '../../app_context';
import { listOciPackages, pullOciPackage } from './client';
import { getOciRegistryConfig } from './config';

jest.mock('node-fetch');
jest.mock('../../app_context', () => ({
  appContextService: {
    getLogger: jest.fn(() => ({
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    })),
    getKibanaVersion: jest.fn(() => '9.0.0'),
    getConfig: jest.fn(),
  },
}));
jest.mock('../registry/proxy', () => ({
  getRegistryProxyUrl: jest.fn(() => undefined),
  getProxyAgent: jest.fn(),
}));
jest.mock('../registry/requests', () => ({
  getFetchOptions: jest.fn(() => ({ headers: {} })),
}));

const mockedFetch = jest.mocked(fetch);

const zipBuffer = Buffer.from('test-zip-content');
const zipDigest = `sha256:${createHash('sha256').update(zipBuffer).digest('hex')}`;

const manifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
  artifactType: 'application/vnd.elastic.fleet.integration.v1+zip',
  layers: [
    {
      mediaType: 'application/zip',
      digest: zipDigest,
      size: zipBuffer.byteLength,
      annotations: {
        'org.opencontainers.image.title': 'Acme Widgets',
        'org.opencontainers.image.description': 'Demo package',
      },
    },
  ],
};

const createResponse = (body: unknown, url?: string) =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    url: url ?? 'http://localhost:5000/v2/test/manifests/1.0.0',
    headers: {
      get: () => null,
    },
    json: async () => body,
    arrayBuffer: async () => zipBuffer,
  } as any);

describe('oci client', () => {
  beforeEach(() => {
    jest.mocked(appContextService.getConfig).mockReturnValue({
      ociRegistry: {
        url: 'http://localhost:5000',
        namespace: 'fleet/integrations',
      },
    } as any);
    mockedFetch.mockReset();
  });

  it('lists packages from the configured registry', async () => {
    mockedFetch
      .mockResolvedValueOnce(
        createResponse({
          repositories: ['fleet/integrations/acme_widgets', 'other/repo'],
        })
      )
      .mockResolvedValueOnce(createResponse({ tags: ['1.0.0'] }))
      .mockResolvedValueOnce(createResponse(manifest));

    const items = await listOciPackages();

    expect(items).toEqual([
      {
        repository: 'fleet/integrations/acme_widgets',
        tag: '1.0.0',
        ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
        title: 'Acme Widgets',
        description: 'Demo package',
        digest: zipDigest,
      },
    ]);
  });

  it('pulls a zip artifact and validates digest', async () => {
    mockedFetch
      .mockResolvedValueOnce(createResponse(manifest))
      .mockResolvedValueOnce(createResponse(zipBuffer));

    const pulledPackage = await pullOciPackage({
      repository: 'fleet/integrations/acme_widgets',
      tag: '1.0.0',
    });

    expect(pulledPackage.archiveBuffer).toEqual(zipBuffer);
    expect(pulledPackage.contentType).toBe('application/zip');
    expect(pulledPackage.repository).toBe('fleet/integrations/acme_widgets');
    expect(pulledPackage.tag).toBe('1.0.0');
  });

  it('throws when OCI registry is not configured', async () => {
    jest.mocked(appContextService.getConfig).mockReturnValue({} as any);
    await expect(listOciPackages()).rejects.toThrow('OCI registry is not configured');
  });

  it('uses configured registry url for repository and tag installs', () => {
    expect(getOciRegistryConfig()).toEqual({
      url: 'http://localhost:5000',
      namespace: 'fleet/integrations',
      username: undefined,
      password: undefined,
    });
  });
});
