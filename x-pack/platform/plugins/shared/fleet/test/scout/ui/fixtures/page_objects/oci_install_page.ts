/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';

export class OciInstallPage {
  constructor(private readonly page: ScoutPage) {}

  async navigateTo() {
    await this.page.gotoApp('integrations', { hash: '/oci' });
  }

  getManualRefInput() {
    return this.page.testSubj.locator('ociInstallManualRefInput');
  }

  getManualInstallButton() {
    return this.page.testSubj.locator('ociInstallManualRefBtn');
  }

  getPackagesTable() {
    return this.page.testSubj.locator('ociInstallPackagesTable');
  }

  getInstallPackageButton() {
    return this.page.testSubj.locator('ociInstallPackageBtn');
  }

  getRegistryUnavailableCallout() {
    return this.page.testSubj.locator('ociRegistryUnavailableCallout');
  }
}
