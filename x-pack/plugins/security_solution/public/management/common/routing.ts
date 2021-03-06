/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { isEmpty } from 'lodash/fp';
import { generatePath } from 'react-router-dom';
// eslint-disable-next-line import/no-nodejs-modules
import querystring from 'querystring';

import {
  MANAGEMENT_DEFAULT_PAGE,
  MANAGEMENT_DEFAULT_PAGE_SIZE,
  MANAGEMENT_PAGE_SIZE_OPTIONS,
  MANAGEMENT_ROUTING_ENDPOINTS_PATH,
  MANAGEMENT_ROUTING_POLICIES_PATH,
  MANAGEMENT_ROUTING_POLICY_DETAILS_PATH,
  MANAGEMENT_ROUTING_TRUSTED_APPS_PATH,
} from './constants';
import { AdministrationSubTab } from '../types';
import { appendSearch } from '../../common/components/link_to/helpers';
import { EndpointIndexUIQueryParams } from '../pages/endpoint_hosts/types';

// Taken from: https://github.com/microsoft/TypeScript/issues/12936#issuecomment-559034150
type ExactKeys<T1, T2> = Exclude<keyof T1, keyof T2> extends never ? T1 : never;
type Exact<T, Shape> = T extends Shape ? ExactKeys<T, Shape> : never;

/**
 * Returns a string to be used in the URL as search query params.
 * Ensures that when creating a URL query param string, that the given input strictly
 * matches the expected interface (guards against possibly leaking internal state)
 */
const querystringStringify: <ExpectedType extends object, ArgType>(
  params: Exact<ExpectedType, ArgType>
) => string = querystring.stringify;

/** Make `selected_endpoint` required */
type EndpointDetailsUrlProps = Omit<EndpointIndexUIQueryParams, 'selected_endpoint'> &
  Required<Pick<EndpointIndexUIQueryParams, 'selected_endpoint'>>;

export const getEndpointListPath = (
  props: { name: 'default' | 'endpointList' } & EndpointIndexUIQueryParams,
  search?: string
) => {
  const { name, ...queryParams } = props;
  const urlQueryParams = querystringStringify<EndpointIndexUIQueryParams, typeof queryParams>(
    queryParams
  );
  const urlSearch = `${urlQueryParams && !isEmpty(search) ? '&' : ''}${search ?? ''}`;

  if (name === 'endpointList') {
    return `${generatePath(MANAGEMENT_ROUTING_ENDPOINTS_PATH, {
      tabName: AdministrationSubTab.endpoints,
    })}${appendSearch(`${urlQueryParams ? `${urlQueryParams}${urlSearch}` : urlSearch}`)}`;
  }
  return `${appendSearch(`${urlQueryParams ? `${urlQueryParams}${urlSearch}` : urlSearch}`)}`;
};

export const getEndpointDetailsPath = (
  props: { name: 'endpointDetails' | 'endpointPolicyResponse' } & EndpointIndexUIQueryParams &
    EndpointDetailsUrlProps,
  search?: string
) => {
  const { name, ...queryParams } = props;
  queryParams.show = (props.name === 'endpointPolicyResponse'
    ? 'policy_response'
    : '') as EndpointIndexUIQueryParams['show'];
  const urlQueryParams = querystringStringify<EndpointDetailsUrlProps, typeof queryParams>(
    queryParams
  );
  const urlSearch = `${urlQueryParams && !isEmpty(search) ? '&' : ''}${search ?? ''}`;

  return `${generatePath(MANAGEMENT_ROUTING_ENDPOINTS_PATH, {
    tabName: AdministrationSubTab.endpoints,
  })}${appendSearch(`${urlQueryParams ? `${urlQueryParams}${urlSearch}` : urlSearch}`)}`;
};

export const getPoliciesPath = (search?: string) => {
  return `${generatePath(MANAGEMENT_ROUTING_POLICIES_PATH, {
    tabName: AdministrationSubTab.policies,
  })}${appendSearch(search)}`;
};

export const getPolicyDetailPath = (policyId: string, search?: string) => {
  return `${generatePath(MANAGEMENT_ROUTING_POLICY_DETAILS_PATH, {
    tabName: AdministrationSubTab.policies,
    policyId,
  })}${appendSearch(search)}`;
};

interface ListPaginationParams {
  page_index: number;
  page_size: number;
}

const isDefaultOrMissing = (value: number | undefined, defaultValue: number) => {
  return value === undefined || value === defaultValue;
};

const normalizeListPaginationParams = (
  params?: Partial<ListPaginationParams>
): Partial<ListPaginationParams> => {
  if (params) {
    return {
      ...(!isDefaultOrMissing(params.page_index, MANAGEMENT_DEFAULT_PAGE)
        ? { page_index: params.page_index }
        : {}),
      ...(!isDefaultOrMissing(params.page_size, MANAGEMENT_DEFAULT_PAGE_SIZE)
        ? { page_size: params.page_size }
        : {}),
    };
  } else {
    return {};
  }
};

const extractFirstParamValue = (query: querystring.ParsedUrlQuery, key: string): string => {
  const value = query[key];

  return Array.isArray(value) ? value[value.length - 1] : value;
};

const extractPageIndex = (query: querystring.ParsedUrlQuery): number => {
  const pageIndex = Number(extractFirstParamValue(query, 'page_index'));

  return !Number.isFinite(pageIndex) || pageIndex < 0 ? MANAGEMENT_DEFAULT_PAGE : pageIndex;
};

const extractPageSize = (query: querystring.ParsedUrlQuery): number => {
  const pageSize = Number(extractFirstParamValue(query, 'page_size'));

  return MANAGEMENT_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : MANAGEMENT_DEFAULT_PAGE_SIZE;
};

export const extractListPaginationParams = (
  query: querystring.ParsedUrlQuery
): ListPaginationParams => ({
  page_index: extractPageIndex(query),
  page_size: extractPageSize(query),
});

export const getTrustedAppsListPath = (params?: Partial<ListPaginationParams>): string => {
  const path = generatePath(MANAGEMENT_ROUTING_TRUSTED_APPS_PATH, {
    tabName: AdministrationSubTab.trustedApps,
  });

  return `${path}${appendSearch(querystring.stringify(normalizeListPaginationParams(params)))}`;
};
