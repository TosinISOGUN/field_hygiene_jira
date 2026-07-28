import Resolver from '@forge/resolver';
import { asApp, asUser, route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';

const resolver = new Resolver();

const PAGE_SIZE = 100;

// The only place field-name normalization happens. Used solely as a grouping
// key — the real field.name is always what gets returned/displayed.
function normalizeFieldName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Standard edit-distance DP, no dependency. Small strings (field names), cost
// is negligible.
function levenshteinDistance(a, b) {
  const rows = a.length;
  const cols = b.length;
  const dp = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let i = 0; i <= rows; i++) dp[i][0] = i;
  for (let j = 0; j <= cols; j++) dp[0][j] = j;

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[rows][cols];
}

// 0..1, 1 meaning identical. Compared on already-normalized names.
function nameSimilarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

// Conservative on purpose — this is a heuristic guess, not a confirmed
// collision, and false positives are more costly than missed ones.
const FUZZY_SIMILARITY_THRESHOLD = 0.75;

// Loops GET /rest/api/3/field/search until every page of custom fields has
// been collected. type=custom filters server-side; expand pulls in isLocked
// (not returned by default), screensCount and lastUsed (used for unused-field
// detection — no separate API call needed for either).
//
// Takes the calling identity (asUser or asApp) as a parameter rather than
// hardcoding asUser() — the interactive resolver always passes asUser; only
// the scheduled snapshot trigger passes asApp, since scheduled triggers run
// with no user context and asUser() cannot work there. That's the one,
// deliberate exception to this app's "asUser() always" rule — see
// takeDailySnapshot() and CLAUDE.md's Security rules section.
async function fetchAllCustomFields(identity) {
  const fields = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await identity().requestJira(
      route`/rest/api/3/field/search?type=custom&expand=isLocked,screensCount,lastUsed&startAt=${startAt}&maxResults=${PAGE_SIZE}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Jira field search failed with status ${response.status}`);
    }

    const page = await response.json();
    fields.push(...page.values);
    isLast = page.isLast;
    startAt += PAGE_SIZE;
  }

  return fields;
}

// Groups already-filtered fields by normalized name and keeps only groups
// with two or more fields — a group of one is not a collision.
function groupCollisions(fields) {
  const groups = new Map();

  for (const field of fields) {
    const key = normalizeFieldName(field.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ id: field.id, name: field.name, type: field.schema?.type });
  }

  const collisions = [];
  for (const [normalizedName, groupFields] of groups) {
    if (groupFields.length >= 2) {
      const hasTypeMismatch = new Set(groupFields.map((field) => field.type)).size > 1;
      collisions.push({ normalizedName, fields: groupFields, hasTypeMismatch });
    }
  }

  return collisions;
}

// Pairwise near-duplicate check over fields that aren't already part of an
// exact-match collision. Each qualifying pair is its own entry — no
// transitive clustering, kept simple on purpose for v1.
function findPossibleDuplicates(fields, collisions) {
  const collidingNormalizedNames = new Set(collisions.map((c) => c.normalizedName));

  const singletonFields = fields
    .filter((field) => !collidingNormalizedNames.has(normalizeFieldName(field.name)))
    .map((field) => ({
      id: field.id,
      name: field.name,
      type: field.schema?.type,
      normalizedName: normalizeFieldName(field.name),
    }));

  const possibleDuplicates = [];
  for (let i = 0; i < singletonFields.length; i++) {
    for (let j = i + 1; j < singletonFields.length; j++) {
      const fieldA = singletonFields[i];
      const fieldB = singletonFields[j];
      const similarity = nameSimilarity(fieldA.normalizedName, fieldB.normalizedName);

      if (similarity >= FUZZY_SIMILARITY_THRESHOLD) {
        possibleDuplicates.push({
          fieldA: { id: fieldA.id, name: fieldA.name, type: fieldA.type },
          fieldB: { id: fieldB.id, name: fieldB.name, type: fieldB.type },
          similarity,
        });
      }
    }
  }

  possibleDuplicates.sort((a, b) => b.similarity - a.similarity);
  return possibleDuplicates;
}

// Matches Site Optimizer's documented window for flagging a field unused.
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

// No extra API calls — screensCount and lastUsed already ride along on the
// field list from fetchAllCustomFields(). A field is unused if it's on no
// screen, or (when Jira actually tracks it) hasn't changed in 2+ years.
function findUnusedFields(fields) {
  const unused = [];

  for (const field of fields) {
    const hasNoScreen = field.screensCount === 0;
    const isStale =
      field.lastUsed?.type === 'TRACKED' &&
      Date.now() - new Date(field.lastUsed.value).getTime() > TWO_YEARS_MS;

    if (hasNoScreen || isStale) {
      unused.push({
        id: field.id,
        name: field.name,
        type: field.schema?.type,
        reason: hasNoScreen ? 'no-screen' : 'stale',
      });
    }
  }

  return unused;
}

// Loops GET /rest/api/3/project/search. style: 'classic' | 'next-gen' and
// simplified come back by default, no expand needed.
async function fetchProjects() {
  const projects = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await asUser().requestJira(
      route`/rest/api/3/project/search?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Project search failed with status ${response.status}`);
    }

    const page = await response.json();
    projects.push(...page.values);
    isLast = page.isLast;
    startAt += PAGE_SIZE;
  }

  return projects;
}

const CLASSIC_SCHEME_FIELD_LIMIT = 700;

// GET /rest/api/3/config/fieldschemes (the documented, non-deprecated field
// association scheme API) returned a 404 on the dev site despite the correct
// scope — confirmed empirically 2026-07-28, most likely not rolled out to
// every site yet. Falls back to the older field-configuration-scheme API,
// which needs three calls plus a per-configuration field lookup instead of
// one call with a free fieldsCount, but uses the same manage:jira-configuration
// scope, so no further scope change is needed.
async function fetchFieldConfigurationSchemes() {
  const schemes = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await asUser().requestJira(
      route`/rest/api/3/fieldconfigurationscheme?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Field configuration scheme list failed with status ${response.status}`);
    }

    const page = await response.json();
    schemes.push(...page.values);
    isLast = page.isLast;
    startAt += PAGE_SIZE;
  }

  return schemes;
}

// { fieldConfigurationSchemeId, issueTypeId, fieldConfigurationId } rows —
// a scheme can map different issue types to different field configurations,
// so a scheme's real field set is the union across all configs it uses.
async function fetchSchemeToConfigMapping() {
  const mappings = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await asUser().requestJira(
      route`/rest/api/3/fieldconfigurationscheme/mapping?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Field configuration scheme mapping failed with status ${response.status}`);
    }

    const page = await response.json();
    mappings.push(...page.values);
    isLast = page.isLast;
    startAt += PAGE_SIZE;
  }

  return mappings;
}

// Field IDs used by one field configuration, cached across schemes — many
// schemes reuse the same ("Default") configuration, so this avoids
// re-fetching it once per scheme.
async function fetchFieldConfigurationFieldIds(configId, cache) {
  if (cache.has(configId)) {
    return cache.get(configId);
  }

  const ids = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await asUser().requestJira(
      route`/rest/api/3/fieldconfiguration/${configId}/fields?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Field configuration fields lookup failed with status ${response.status}`);
    }

    const page = await response.json();
    ids.push(...page.values.map((item) => item.id));
    isLast = page.isLast;
    startAt += PAGE_SIZE;
  }

  cache.set(configId, ids);
  return ids;
}

// Company-managed (classic) projects share a 700-field budget per field-
// configuration scheme. A scheme's fieldsCount is the union of field IDs
// across every field configuration it maps to (not a sum — the same field
// can appear in more than one configuration within a scheme). Which
// projects use a given scheme isn't included — the endpoint for that
// (/fieldconfigurationscheme/project) requires specific project IDs up
// front rather than listing everything, which isn't a fit here; dropped
// for v1 rather than guessed at.
async function fetchSchemeGuardrails() {
  const [schemes, mappings] = await Promise.all([
    fetchFieldConfigurationSchemes(),
    fetchSchemeToConfigMapping(),
  ]);

  const configFieldIdCache = new Map();
  const guardrails = [];

  for (const scheme of schemes) {
    const configIds = new Set(
      mappings
        .filter((mapping) => mapping.fieldConfigurationSchemeId === scheme.id)
        .map((mapping) => mapping.fieldConfigurationId)
    );

    const fieldIdSet = new Set();
    for (const configId of configIds) {
      const ids = await fetchFieldConfigurationFieldIds(configId, configFieldIdCache);
      for (const id of ids) fieldIdSet.add(id);
    }

    guardrails.push({
      schemeId: scheme.id,
      schemeName: scheme.name,
      fieldsCount: fieldIdSet.size,
      limit: CLASSIC_SCHEME_FIELD_LIMIT,
    });
  }

  return guardrails;
}

const TEAM_MANAGED_FIELD_LIMIT = 50;
const PROJECT_FIELD_COUNT_BATCH_SIZE = 10;

// One /field/search call per team-managed project (using its projectIds
// filter), not one per field — reads total directly, no pagination needed.
async function fetchTeamManagedGuardrails(projects) {
  const teamManagedProjects = projects.filter((project) => project.style === 'next-gen');
  const guardrails = [];

  for (let i = 0; i < teamManagedProjects.length; i += PROJECT_FIELD_COUNT_BATCH_SIZE) {
    const batch = teamManagedProjects.slice(i, i + PROJECT_FIELD_COUNT_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (project) => {
        const response = await asUser().requestJira(
          route`/rest/api/3/field/search?type=custom&projectIds=${project.id}&maxResults=1`,
          { headers: { Accept: 'application/json' } }
        );

        if (!response.ok) {
          throw new Error(
            `Field count for project ${project.id} failed with status ${response.status}`
          );
        }

        const page = await response.json();
        return {
          projectKey: project.key,
          projectName: project.name,
          fieldsCount: page.total,
          limit: TEAM_MANAGED_FIELD_LIMIT,
        };
      })
    );

    guardrails.push(...results);
  }

  return guardrails;
}

resolver.define('getFieldCollisions', async () => {
  let allCustomFields;
  try {
    allCustomFields = await fetchAllCustomFields(asUser);
  } catch (err) {
    // Operational fact only (HTTP status/error message) — never log field names or content.
    console.error('getFieldCollisions: field fetch failed —', err.message);
    return {
      collisions: [],
      possibleDuplicates: [],
      unusedFields: [],
      schemeGuardrails: [],
      teamManagedGuardrails: [],
      guardrailError: null,
      totalCustomFields: 0,
      error: 'Could not read field data from Jira. Please try again.',
    };
  }

  const unlockedFields = allCustomFields.filter((field) => !field.isLocked);
  const collisions = groupCollisions(unlockedFields);
  const possibleDuplicates = findPossibleDuplicates(unlockedFields, collisions);
  const unusedFields = findUnusedFields(unlockedFields);

  let schemeGuardrails = [];
  let teamManagedGuardrails = [];
  let guardrailError = null;
  try {
    const projects = await fetchProjects();
    [schemeGuardrails, teamManagedGuardrails] = await Promise.all([
      fetchSchemeGuardrails(),
      fetchTeamManagedGuardrails(projects),
    ]);
  } catch (err) {
    console.error('getFieldCollisions: guardrail scan failed —', err.message);
    guardrailError = 'Could not read field-count limits. Other results are still accurate.';
  }

  return {
    collisions,
    possibleDuplicates,
    unusedFields,
    schemeGuardrails,
    teamManagedGuardrails,
    guardrailError,
    totalCustomFields: unlockedFields.length,
    error: null,
  };
});

const SNAPSHOT_KEY_PREFIX = 'snapshot:';
const SNAPSHOT_RETENTION_DAYS = 90;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function dateStringDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// Runs once a day with no user context (see fetchAllCustomFields's asApp
// note) — asApp() here is the one, owner-approved exception to this app's
// "asUser() always" rule. Stores counts only, never field names or IDs, per
// the "stores nothing" brand promise's Trends exception.
export async function dailySnapshotTrigger() {
  try {
    const allCustomFields = await fetchAllCustomFields(asApp);
    const unlockedFields = allCustomFields.filter((field) => !field.isLocked);
    const collisions = groupCollisions(unlockedFields);
    const possibleDuplicates = findPossibleDuplicates(unlockedFields, collisions);
    const unusedFields = findUnusedFields(unlockedFields);

    const today = todayDateString();
    await kvs.set(`${SNAPSHOT_KEY_PREFIX}${today}`, {
      date: today,
      totalCustomFields: unlockedFields.length,
      collisionGroups: collisions.length,
      unusedFieldsCount: unusedFields.length,
      possibleDuplicatesCount: possibleDuplicates.length,
    });

    const expiredKey = `${SNAPSHOT_KEY_PREFIX}${dateStringDaysAgo(SNAPSHOT_RETENTION_DAYS + 1)}`;
    await kvs.delete(expiredKey);

    // Operational fact only (a date, a count) — confirms the job ran, since
    // scheduled triggers otherwise fire silently on success.
    console.log(`dailySnapshotTrigger: stored snapshot for ${today} (${unlockedFields.length} fields)`);
  } catch (err) {
    // A missed snapshot day is a gap in the trend line, not fatal — never
    // let it throw and fail the whole scheduled invocation loudly.
    console.error('dailySnapshotTrigger: snapshot failed —', err.message);
  }
}

resolver.define('getFieldTrends', async () => {
  const snapshots = [];
  let cursor;

  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(SNAPSHOT_KEY_PREFIX));
    if (cursor) {
      query = query.cursor(cursor);
    }

    const page = await query.getMany();
    snapshots.push(...page.results.map((result) => result.value));
    cursor = page.nextCursor;
  } while (cursor);

  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  return { snapshots };
});

export const handler = resolver.getDefinitions();
