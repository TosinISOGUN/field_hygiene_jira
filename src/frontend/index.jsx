import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Inline,
  Box,
  Badge,
  Lozenge,
  Spinner,
  SectionMessage,
  EmptyState,
  DynamicTable,
  ProgressBar,
  HorizontalBarChart,
  LineChart,
  Button,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const tableHead = {
  cells: [
    { key: 'name', content: 'Name' },
    { key: 'type', content: 'Type' },
    { key: 'id', content: 'Field ID' },
  ],
};

function fieldRows(fields) {
  return fields.map((field) => ({
    key: field.id,
    cells: [
      { key: 'name', content: field.name },
      { key: 'type', content: <Lozenge>{field.type}</Lozenge> },
      { key: 'id', content: field.id },
    ],
  }));
}

const UNUSED_REASON_LABEL = {
  'no-screen': 'Not on any screen',
  stale: 'No activity in 2+ years',
};

function unusedFieldRows(fields) {
  return fields.map((field) => ({
    key: field.id,
    cells: [
      {
        key: 'name',
        content: (
          <Inline space="space.100" alignBlock="center">
            <Text>{field.name}</Text>
            <Lozenge appearance="moved">{UNUSED_REASON_LABEL[field.reason]}</Lozenge>
          </Inline>
        ),
      },
      { key: 'type', content: <Lozenge>{field.type}</Lozenge> },
      { key: 'id', content: field.id },
    ],
  }));
}

// Alternates two brand colors per bar so a long list of duplicate-name
// groups is easier to scan row-by-row, not tied to any data meaning.
const CHART_COLOR_PALETTE = [
  { key: 'a', value: '#0052CC' },
  { key: 'b', value: '#E8A33D' },
];

const TREND_METRIC_LABEL = {
  totalCustomFields: 'Total custom fields',
  collisionGroups: 'Duplicate groups',
  unusedFieldsCount: 'Unused fields',
  possibleDuplicatesCount: 'Possible duplicates',
};

const App = () => {
  const [result, setResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [trends, setTrends] = useState(null);

  const scan = () => {
    setIsScanning(true);
    invoke('getFieldCollisions').then((next) => {
      setResult(next);
      setIsScanning(false);
    });
  };

  useEffect(scan, []);
  // Independent of the rescan button — trend history only changes once a
  // day (the scheduled snapshot), so there's no reason to refetch it every
  // time someone re-runs the live scan.
  useEffect(() => {
    invoke('getFieldTrends').then(setTrends);
  }, []);

  if (!result) {
    return (
      <Stack space="space.200" alignInline="center">
        <Spinner size="large" />
        <Text>Scanning fields…</Text>
      </Stack>
    );
  }

  const rescanButton = (
    <Button onClick={scan} isDisabled={isScanning} iconBefore="refresh">
      {isScanning ? 'Scanning…' : 'Rescan'}
    </Button>
  );

  if (result.error) {
    return (
      <Stack space="space.200" alignInline="start">
        <SectionMessage appearance="error" title="Couldn't scan fields">
          <Text>{result.error}</Text>
        </SectionMessage>
        {rescanButton}
      </Stack>
    );
  }

  // Combined, sorted by how close each scheme/project is to its own limit —
  // company-managed schemes and team-managed projects are different limit
  // models (700 vs 50), so each row carries its own limit rather than
  // assuming one shared ceiling.
  const guardrailRows = [
    ...result.schemeGuardrails.map((g) => ({
      kind: 'scheme',
      key: `scheme-${g.schemeId}`,
      name: g.schemeName,
      fieldsCount: g.fieldsCount,
      limit: g.limit,
      detail: 'Company-managed field configuration scheme',
    })),
    ...result.teamManagedGuardrails.map((g) => ({
      kind: 'team-managed',
      key: `project-${g.projectKey}`,
      name: g.projectName,
      fieldsCount: g.fieldsCount,
      limit: g.limit,
      detail: `Team-managed project (${g.projectKey})`,
    })),
  ].sort((a, b) => b.fieldsCount / b.limit - a.fieldsCount / a.limit);

  const hasGuardrailData = guardrailRows.length > 0;

  const guardrailSection = (hasGuardrailData || result.guardrailError) && (
    <Stack space="space.150">
      <Heading size="medium">Field limits</Heading>
      <Text>
        Company-managed scheme counts include all fields (system and custom), against
        Atlassian's 700-per-scheme limit. Team-managed project counts are custom fields only,
        against the 50-per-project limit.
      </Text>
      {result.guardrailError && (
        <SectionMessage appearance="warning" title="Field-limit check didn't complete">
          <Text>{result.guardrailError}</Text>
        </SectionMessage>
      )}
      {hasGuardrailData && (
        <Stack space="space.150">
          {guardrailRows.map((row) => {
            const ratio = row.fieldsCount / row.limit;
            return (
              <Box key={row.key} backgroundColor="color.background.neutral" padding="space.200">
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center">
                    <Heading size="small">{row.name}</Heading>
                    {ratio >= 0.8 && <Lozenge appearance="removed">Near limit</Lozenge>}
                  </Inline>
                  <Text>
                    {row.fieldsCount} of {row.limit} fields (
                    {row.kind === 'scheme' ? 'field configuration scheme' : 'team-managed project'})
                  </Text>
                  <ProgressBar
                    ariaLabel={`${row.fieldsCount} of ${row.limit} fields`}
                    value={Math.min(ratio, 1)}
                  />
                  <Text>{row.detail}</Text>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );

  // Long-format rows (one per metric per day) — the shape LineChart's
  // colorAccessor expects to draw one line per metric, same pattern already
  // used for the bar chart's colorAccessor grouping.
  const trendsSection = trends && (
    <Stack space="space.150">
      <Heading size="medium">Trends</Heading>
      {trends.snapshots.length < 2 ? (
        <Text>
          Building history — Field Hygiene takes one snapshot a day. Check back once at least
          two days have passed.
        </Text>
      ) : (
        <>
          <Text>Daily snapshots, last {trends.snapshots.length} days.</Text>
          <LineChart
            data={trends.snapshots.flatMap((snapshot) =>
              Object.keys(TREND_METRIC_LABEL).map((metric) => ({
                date: snapshot.date,
                metric: TREND_METRIC_LABEL[metric],
                value: snapshot[metric],
              }))
            )}
            xAccessor="date"
            yAccessor="value"
            colorAccessor="metric"
            title="Field health over time"
            height={300}
          />
        </>
      )}
    </Stack>
  );

  const hasAnySignal =
    result.collisions.length > 0 ||
    result.possibleDuplicates.length > 0 ||
    result.unusedFields.length > 0;

  if (!hasAnySignal) {
    return (
      <Stack space="space.300" alignInline="center">
        <EmptyState
          header="No issues found"
          description={`Checked ${result.totalCustomFields} custom fields — no duplicates, near-duplicates, or unused fields.`}
        />
        {rescanButton}
        {guardrailSection}
        {trendsSection}
      </Stack>
    );
  }

  const affectedFieldCount = result.collisions.reduce(
    (total, collision) => total + collision.fields.length,
    0
  );

  // Stable sort: type-mismatch collisions (the dangerous case) surface above
  // same-type ones, preserving resolver order within each bucket.
  const sortedCollisions = result.collisions
    .map((collision, index) => ({ collision, index }))
    .sort((a, b) => {
      if (a.collision.hasTypeMismatch !== b.collision.hasTypeMismatch) {
        return a.collision.hasTypeMismatch ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ collision }) => collision);

  const groupSizeData = sortedCollisions.map((collision, index) => ({
    xAxis: collision.fields[0].name,
    value: collision.fields.length,
    colorGroup: index % 2 === 0 ? 'a' : 'b',
  }));

  return (
    <Stack space="space.300">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Heading size="large">Field scan results</Heading>
        {rescanButton}
      </Inline>

      {result.collisions.length > 0 && (
        <Stack space="space.300">
          <Stack space="space.050">
            <Inline space="space.100" alignBlock="center">
              <Heading size="medium">Duplicate names found</Heading>
              <Badge appearance="important">{result.collisions.length}</Badge>
            </Inline>
            <Text>
              {affectedFieldCount} fields share a name with at least one other field.
            </Text>
          </Stack>

          <Stack space="space.100">
            <Text>
              {affectedFieldCount} of {result.totalCustomFields} custom fields affected
            </Text>
            <ProgressBar
              ariaLabel={`${affectedFieldCount} of ${result.totalCustomFields} custom fields affected`}
              value={affectedFieldCount / result.totalCustomFields}
            />
          </Stack>

          <HorizontalBarChart
            data={groupSizeData}
            xAccessor="xAxis"
            yAccessor="value"
            colorAccessor="colorGroup"
            colorPalette={CHART_COLOR_PALETTE}
            title="Fields per duplicate name"
            height={300}
          />

          <Stack space="space.300">
            {sortedCollisions.map((collision) => (
              <Box
                key={collision.normalizedName}
                backgroundColor="color.background.neutral"
                padding="space.200"
              >
                <Stack space="space.150">
                  <Inline space="space.100" alignBlock="center">
                    <Heading size="small">{collision.fields[0].name}</Heading>
                    {collision.hasTypeMismatch && (
                      <Lozenge appearance="removed">Type mismatch</Lozenge>
                    )}
                  </Inline>
                  <DynamicTable head={tableHead} rows={fieldRows(collision.fields)} />
                </Stack>
              </Box>
            ))}
          </Stack>
        </Stack>
      )}

      {result.possibleDuplicates.length > 0 && (
        <Stack space="space.150">
          <Heading size="medium">Possible duplicates</Heading>
          <Text>
            These names look similar but weren't flagged as exact duplicates — worth a manual
            look.
          </Text>
          <Stack space="space.200">
            {result.possibleDuplicates.map((pair) => (
              <Box
                key={`${pair.fieldA.id}-${pair.fieldB.id}`}
                backgroundColor="color.background.neutral"
                padding="space.200"
              >
                <Stack space="space.150">
                  <Inline space="space.100" alignBlock="center">
                    <Heading size="small">
                      {pair.fieldA.name} / {pair.fieldB.name}
                    </Heading>
                    <Lozenge appearance="new">{Math.round(pair.similarity * 100)}% similar</Lozenge>
                  </Inline>
                  <DynamicTable head={tableHead} rows={fieldRows([pair.fieldA, pair.fieldB])} />
                </Stack>
              </Box>
            ))}
          </Stack>
        </Stack>
      )}

      {result.unusedFields.length > 0 && (
        <Stack space="space.150">
          <Heading size="medium">Unused fields</Heading>
          <Text>
            Not attached to any screen, or no activity in over 2 years. Candidates for
            cleanup, not automatically safe to delete.
          </Text>
          <DynamicTable head={tableHead} rows={unusedFieldRows(result.unusedFields)} />
        </Stack>
      )}

      {guardrailSection}
      {trendsSection}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
