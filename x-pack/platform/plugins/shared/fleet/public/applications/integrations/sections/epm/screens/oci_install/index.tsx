/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { useQueryClient } from '@kbn/react-query';

import type { OciPackageListItem } from '../../../../../../types';
import { useStartServices, useBreadcrumbs } from '../../../../hooks';
import {
  sendInstallPackageFromOci,
  useListOciPackagesQuery,
} from '../../../../../../hooks/use_request/epm';
import { pagePathGetters } from '../../../../constants';

const getPackageVersionFromInstallInput = (input: {
  ref?: string;
  repository?: string;
  tag?: string;
}): string | undefined => {
  if (input.tag) {
    return input.tag;
  }

  if (!input.ref) {
    return undefined;
  }

  const tagSeparatorIndex = input.ref.lastIndexOf(':');
  if (tagSeparatorIndex === -1) {
    return undefined;
  }

  return input.ref.slice(tagSeparatorIndex + 1);
};

export const OciInstall: React.FC = () => {
  useBreadcrumbs('integration_oci_install');
  const queryClient = useQueryClient();
  const {
    application: { navigateToApp },
    notifications: { toasts },
  } = useStartServices();
  const [manualRef, setManualRef] = useState('');
  const [installingRef, setInstallingRef] = useState<string>();
  const { data, error, isLoading, refetch, isRefetching } = useListOciPackagesQuery();

  const items = data?.items ?? [];
  const isRegistryUnavailable = Boolean(error);

  const onBack = useCallback(() => {
    navigateToApp('integrations', { path: '/browse' });
  }, [navigateToApp]);

  const installPackage = useCallback(
    async (input: { ref?: string; repository?: string; tag?: string }) => {
      const installKey = input.ref ?? `${input.repository}:${input.tag}`;
      setInstallingRef(installKey);

      try {
        const response = await sendInstallPackageFromOci(input);
        const packageVersion = getPackageVersionFromInstallInput(input);

        await queryClient.invalidateQueries({ queryKey: ['get-packages'] });

        toasts.addSuccess({
          title: i18n.translate('xpack.fleet.ociInstall.installSuccessTitle', {
            defaultMessage: 'Package installed',
          }),
          text: i18n.translate('xpack.fleet.ociInstall.installSuccessText', {
            defaultMessage: 'Installed {packageName} from OCI registry.',
            values: { packageName: response._meta.name },
          }),
        });
        await refetch();

        if (packageVersion) {
          navigateToApp('integrations', {
            path: pagePathGetters.integration_details_overview({
              pkgkey: `${response._meta.name}-${packageVersion}`,
            })[1],
          });
        }
      } catch (installError) {
        toasts.addError(installError as Error, {
          title: i18n.translate('xpack.fleet.ociInstall.installErrorTitle', {
            defaultMessage: 'Failed to install package from OCI registry',
          }),
        });
      } finally {
        setInstallingRef(undefined);
      }
    },
    [navigateToApp, queryClient, refetch, toasts]
  );

  const onManualInstall = useCallback(async () => {
    if (!manualRef.trim()) {
      return;
    }

    await installPackage({ ref: manualRef.trim() });
  }, [installPackage, manualRef]);

  const columns = useMemo(
    (): Array<EuiBasicTableColumn<OciPackageListItem>> => [
      {
        field: 'title',
        name: i18n.translate('xpack.fleet.ociInstall.tableTitleColumn', {
          defaultMessage: 'Title',
        }),
        render: (title: string | undefined, item: OciPackageListItem) => title ?? item.repository,
      },
      {
        field: 'repository',
        name: i18n.translate('xpack.fleet.ociInstall.tableRepositoryColumn', {
          defaultMessage: 'Repository',
        }),
      },
      {
        field: 'tag',
        name: i18n.translate('xpack.fleet.ociInstall.tableTagColumn', {
          defaultMessage: 'Tag',
        }),
      },
      {
        field: 'ref',
        name: i18n.translate('xpack.fleet.ociInstall.tableRefColumn', {
          defaultMessage: 'OCI reference',
        }),
      },
      {
        name: i18n.translate('xpack.fleet.ociInstall.tableActionsColumn', {
          defaultMessage: 'Actions',
        }),
        actions: [
          {
            name: i18n.translate('xpack.fleet.ociInstall.installAction', {
              defaultMessage: 'Install',
            }),
            description: i18n.translate('xpack.fleet.ociInstall.installActionDescription', {
              defaultMessage: 'Install this package from the OCI registry',
            }),
            icon: 'importAction',
            type: 'icon' as const,
            'data-test-subj': 'ociInstallPackageBtn',
            enabled: (item: OciPackageListItem) =>
              installingRef !== item.ref && installingRef !== `${item.repository}:${item.tag}`,
            onClick: (item: OciPackageListItem) =>
              installPackage({
                repository: item.repository,
                tag: item.tag,
              }),
          },
        ],
      },
    ],
    [installPackage, installingRef]
  );

  return (
    <KibanaPageTemplate>
      <KibanaPageTemplate.Header
        pageTitle={i18n.translate('xpack.fleet.ociInstall.pageTitle', {
          defaultMessage: 'Install from OCI registry',
        })}
        description={i18n.translate('xpack.fleet.ociInstall.pageDescription', {
          defaultMessage:
            'Discover and install integration packages published to the configured OCI registry.',
        })}
        rightSideItems={[
          <EuiButtonEmpty iconType="arrowLeft" onClick={onBack} data-test-subj="ociInstallBackBtn">
            {i18n.translate('xpack.fleet.ociInstall.backButton', {
              defaultMessage: 'Back to integrations',
            })}
          </EuiButtonEmpty>,
        ]}
      />
      <KibanaPageTemplate.Section>
        {isRegistryUnavailable && (
          <>
            <EuiCallOut
              announceOnMount
              title={i18n.translate('xpack.fleet.ociInstall.registryUnavailableTitle', {
                defaultMessage: 'OCI registry is unavailable',
              })}
              color="warning"
              iconType="alert"
              data-test-subj="ociRegistryUnavailableCallout"
            >
              <p>
                <FormattedMessage
                  id="xpack.fleet.ociInstall.registryUnavailableDescription"
                  defaultMessage="Configure {setting} in kibana.yml and ensure the registry is reachable. You can still install a package by pasting an OCI reference below."
                  values={{
                    setting: <code>xpack.fleet.ociRegistry.url</code>,
                  }}
                />
              </p>
              {error?.message ? <p>{error.message}</p> : null}
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        <EuiText size="s">
          <h3>
            {i18n.translate('xpack.fleet.ociInstall.manualInstallTitle', {
              defaultMessage: 'Install by OCI reference',
            })}
          </h3>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup alignItems="flexEnd">
          <EuiFlexItem>
            <EuiFieldText
              fullWidth
              value={manualRef}
              onChange={(event) => setManualRef(event.target.value)}
              placeholder={i18n.translate('xpack.fleet.ociInstall.manualRefPlaceholder', {
                defaultMessage: 'localhost:5000/fleet/integrations/acme_widgets:1.0.0',
              })}
              aria-label={i18n.translate('xpack.fleet.ociInstall.manualRefAriaLabel', {
                defaultMessage: 'OCI reference',
              })}
              data-test-subj="ociInstallManualRefInput"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={onManualInstall}
              isLoading={installingRef === manualRef.trim()}
              disabled={!manualRef.trim()}
              data-test-subj="ociInstallManualRefBtn"
            >
              {i18n.translate('xpack.fleet.ociInstall.manualInstallButton', {
                defaultMessage: 'Install',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <h3>
                {i18n.translate('xpack.fleet.ociInstall.discoveredPackagesTitle', {
                  defaultMessage: 'Discovered packages',
                })}
              </h3>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              iconType="refresh"
              onClick={() => refetch()}
              isLoading={isRefetching}
              data-test-subj="ociInstallRefreshBtn"
            >
              {i18n.translate('xpack.fleet.ociInstall.refreshButton', {
                defaultMessage: 'Refresh',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiBasicTable
          items={items}
          columns={columns}
          loading={isLoading || isRefetching}
          data-test-subj="ociInstallPackagesTable"
          tableCaption={i18n.translate('xpack.fleet.ociInstall.packagesTableCaption', {
            defaultMessage: 'Packages discovered in the OCI registry',
          })}
          noItemsMessage={i18n.translate('xpack.fleet.ociInstall.noPackagesMessage', {
            defaultMessage: 'No packages found in the configured OCI registry.',
          })}
        />
      </KibanaPageTemplate.Section>
    </KibanaPageTemplate>
  );
};
