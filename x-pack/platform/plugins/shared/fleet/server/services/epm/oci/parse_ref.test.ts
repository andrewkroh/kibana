/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatOciRef, parseOciRef } from './parse_ref';

describe('parseOciRef', () => {
  it('parses refs without scheme', () => {
    expect(parseOciRef('localhost:5000/fleet/integrations/acme_widgets:1.0.0')).toEqual({
      registryUrl: 'http://localhost:5000',
      repository: 'fleet/integrations/acme_widgets',
      tag: '1.0.0',
    });
  });

  it('parses refs with scheme', () => {
    expect(
      parseOciRef('https://registry.example.com/fleet/integrations/acme_widgets:2.0.0')
    ).toEqual({
      registryUrl: 'https://registry.example.com',
      repository: 'fleet/integrations/acme_widgets',
      tag: '2.0.0',
    });
  });

  it('throws for invalid refs', () => {
    expect(() => parseOciRef('invalid-ref')).toThrow('Invalid OCI reference');
  });
});

describe('formatOciRef', () => {
  it('formats refs from registry url and repository', () => {
    expect(
      formatOciRef({
        registryUrl: 'http://localhost:5000',
        repository: 'fleet/integrations/acme_widgets',
        tag: '1.0.0',
      })
    ).toBe('localhost:5000/fleet/integrations/acme_widgets:1.0.0');
  });
});
