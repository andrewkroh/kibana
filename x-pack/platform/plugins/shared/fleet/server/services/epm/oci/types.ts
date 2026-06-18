/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface OciPackageRef {
  repository: string;
  tag: string;
}

export interface OciPackageListItem {
  repository: string;
  tag: string;
  ref: string;
  title?: string;
  description?: string;
  digest?: string;
}

export interface OciPulledPackage {
  archiveBuffer: Buffer;
  contentType: 'application/zip';
  ref: string;
  repository: string;
  tag: string;
}

export interface OciManifestLayer {
  mediaType: string;
  digest: string;
  size: number;
  annotations?: Record<string, string>;
}

export interface OciManifest {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  config?: {
    mediaType: string;
    digest: string;
    size: number;
  };
  layers?: OciManifestLayer[];
  manifests?: Array<{
    mediaType: string;
    digest: string;
    size: number;
  }>;
  annotations?: Record<string, string>;
}
