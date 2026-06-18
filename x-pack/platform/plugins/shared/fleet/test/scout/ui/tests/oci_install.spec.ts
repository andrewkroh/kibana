/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';

import { test } from '../fixtures';

const MOCK_OCI_PACKAGES = {
  items: [
    {
      repository: 'fleet/integrations/acme_widgets',
      tag: '1.0.0',
      ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
      title: 'Acme Widgets',
      description: 'Demo package',
    },
  ],
};

async function mockOciApis(page: ScoutPage, options?: { listFails?: boolean }) {
  await page.route('**/internal/fleet/epm/packages/_list_oci**', (route) => {
    if (options?.listFails) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'OCI registry is not configured' }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_OCI_PACKAGES),
    });
  });

  await page.route('**/internal/fleet/epm/packages/_install_from_oci**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        _meta: {
          install_source: 'upload',
          name: 'acme_widgets',
        },
      }),
    })
  );
}

test.describe('Install from OCI registry', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ page, browserAuth, pageObjects }) => {
    await mockOciApis(page);
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.ociInstall.navigateTo();
  });

  test('renders discovered packages and manual install controls', async ({ pageObjects }) => {
    await expect(pageObjects.ociInstall.getPackagesTable()).toBeVisible();
    await expect(pageObjects.ociInstall.getManualRefInput()).toBeVisible();
    await expect(pageObjects.ociInstall.getPackagesTable()).toContainText('Acme Widgets');
  });

  test('installs a package from a manual OCI reference', async ({ page, pageObjects }) => {
    const installRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/internal/fleet/epm/packages/_install_from_oci') &&
        req.method() === 'POST'
    );

    await pageObjects.ociInstall
      .getManualRefInput()
      .fill('localhost:5000/fleet/integrations/acme_widgets:1.0.0');
    await pageObjects.ociInstall.getManualInstallButton().click();

    const request = await installRequest;
    expect(JSON.parse(request.postData() ?? '{}')).toStrictEqual({
      ref: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
      ignoreMappingUpdateErrors: false,
      skipDataStreamRollover: false,
    });
  });

  test('shows unavailable registry callout when listing fails', async ({ page, pageObjects }) => {
    await page.unroute('**/internal/fleet/epm/packages/_list_oci**');
    await mockOciApis(page, { listFails: true });
    await pageObjects.ociInstall.navigateTo();

    await expect(pageObjects.ociInstall.getRegistryUnavailableCallout()).toBeVisible();
  });
});
