/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FleetUnauthorizedError, FleetTooManyRequestsError } from '../../errors';
import { licenseService } from '../../services';
import { installPackage } from '../../services/epm/packages';
import { listOciPackages, pullOciPackage } from '../../services/epm/oci';

import {
  rollbackPackageHandler,
  listOciPackagesHandler,
  installPackageFromOciHandler,
} from './handlers';

jest.mock('../../services/epm/packages', () => ({
  installPackage: jest.fn(),
}));
jest.mock('../../services/epm/oci', () => ({
  listOciPackages: jest.fn(),
  pullOciPackage: jest.fn(),
  OciRegistryError: class OciRegistryError extends Error {},
}));

jest.mock('../../services', () => {
  return {
    licenseService: {
      isEnterprise: jest.fn(),
    },
  };
});

jest.mock('../../services/epm/packages/rollback', () => {
  return {
    rollbackInstallation: jest.fn(),
  };
});

jest.mock('./bulk_handler', () => {
  return {
    getPackagePolicyIdsForCurrentUser: jest.fn().mockResolvedValue({}),
  };
});

const context = {
  core: {
    elasticsearch: {
      client: {
        asIntegernalUser: jest.fn(),
      },
    },
  },
  fleet: {
    spaceId: 'default',
  },
} as any;
const request = {
  params: { pkgName: 'test-package' },
} as any;
const response = {
  ok: jest.fn(),
} as any;

describe('rollback package handler', () => {
  it('should throw if license is not enterprise', async () => {
    (licenseService.isEnterprise as jest.Mock).mockReturnValue(false);

    await expect(rollbackPackageHandler(context, request, response)).rejects.toThrow(
      FleetUnauthorizedError
    );
  });

  it('should continue if license is enterprise', async () => {
    (licenseService.isEnterprise as jest.Mock).mockReturnValue(true);

    await rollbackPackageHandler(context, request, response);

    expect(response.ok).toHaveBeenCalled();
  });
});

describe('list oci packages handler', () => {
  const listContext = {
    fleet: {
      spaceId: 'default',
    },
  } as any;
  const listResponse = {
    ok: jest.fn(),
    customError: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns listed packages', async () => {
    jest.mocked(listOciPackages).mockResolvedValue([
      {
        repository: 'fleet/integrations/acme_widgets',
        tag: '1.0.0',
        ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
      },
    ]);

    await listOciPackagesHandler(listContext, {} as any, listResponse);

    expect(listResponse.ok).toHaveBeenCalledWith({
      body: {
        items: [
          {
            repository: 'fleet/integrations/acme_widgets',
            tag: '1.0.0',
            ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
          },
        ],
      },
    });
  });
});

describe('install package from oci handler', () => {
  const installContext = {
    core: Promise.resolve({
      elasticsearch: {
        client: {
          asInternalUser: {},
        },
      },
    }),
    fleet: Promise.resolve({
      internalSoClient: {},
      spaceId: 'default',
    }),
  } as any;
  const installResponse = {
    ok: jest.fn(),
    customError: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(pullOciPackage).mockResolvedValue({
      archiveBuffer: Buffer.from('zip'),
      contentType: 'application/zip',
      ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
      repository: 'fleet/integrations/acme_widgets',
      tag: '1.0.0',
    });
  });

  it('installs pulled package through upload path', async () => {
    jest.mocked(installPackage).mockResolvedValue({
      assets: [{ id: 'asset-1', type: 'index-pattern' }],
      installSource: 'upload',
      pkgName: 'acme_widgets',
      installType: 'install',
    } as any);

    await installPackageFromOciHandler(
      installContext,
      {
        body: {
          repository: 'fleet/integrations/acme_widgets',
          tag: '1.0.0',
        },
      } as any,
      installResponse
    );

    expect(installPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        installSource: 'upload',
        contentType: 'application/zip',
      })
    );
    expect(installResponse.ok).toHaveBeenCalledWith({
      body: {
        items: [{ id: 'asset-1', type: 'index-pattern' }],
        _meta: {
          install_source: 'upload',
          name: 'acme_widgets',
        },
      },
    });
  });

  it('returns 429 when upload rate limit is hit', async () => {
    jest.mocked(installPackage).mockResolvedValue({
      error: new FleetTooManyRequestsError('Too many requests'),
      installType: 'install',
      installSource: 'upload',
      pkgName: 'acme_widgets',
    } as any);

    await installPackageFromOciHandler(
      installContext,
      {
        body: {
          ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
        },
      } as any,
      installResponse
    );

    expect(installResponse.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
      })
    );
  });
});
