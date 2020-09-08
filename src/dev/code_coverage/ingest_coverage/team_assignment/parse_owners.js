/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { scheduled, asapScheduler } from 'rxjs';
import { mergeAll, map } from 'rxjs/operators';
import { lineRead, ownerLines$, coverageLine$, pathAndTeams } from './parse_owners_helpers';
export const parse = (codeOwnersPath) => (log) => {
  // const pathsMap = new Map();
  //
  // for (const { files, coverageOwner, excludeFiles } of rules)
  //   for (const file of files) pathsMap.set(file, { coverageOwner, excludeFiles });
  //
  // return pathsMap;

  const rl = lineRead(codeOwnersPath);
  const merged = scheduled([ownerLines$(rl), coverageLine$(rl)], asapScheduler).pipe(
    mergeAll(),
    map(pathAndTeams)
  );

  merged.subscribe((x) => {
    const { path, teams } = x;
    console.log(`\n### path: \n\t${path}`);
    console.log(`\n### teams: \n\t${teams}`);
  });
};
