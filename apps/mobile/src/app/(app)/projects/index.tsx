import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, EmptyState, Fab, LoadingState, ProgressBar, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useEntities } from '@/lib/data';
import { relativeDay } from '@/lib/format';

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const projects = useEntities('project');
  const tasks = useEntities('task');

  const rows = useMemo(() => {
    const all = tasks.data ?? [];
    return (projects.data ?? [])
      .map((p) => {
        const pt = all.filter((t) => t.projectId === p.id && t.status !== 'cancelled');
        const done = pt.filter((t) => t.status === 'done').length;
        return { project: p, total: pt.length, done };
      })
      .sort((a, b) => (a.project.status === b.project.status ? a.project.name.localeCompare(b.project.name) : a.project.status === 'active' ? -1 : 1));
  }, [projects.data, tasks.data]);

  const active = rows.filter((r) => r.project.status === 'active');
  const other = rows.filter((r) => r.project.status !== 'active');

  return (
    <View style={{ flex: 1 }}>
      <Screen header={<ScreenHeader title="Projects" />}>
        {projects.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="folder-open-outline"
            title="No projects yet"
            body="Group related tasks into a project and track progress. Aura can break a goal into steps for you."
            actionLabel="New project"
            onAction={() => router.push('/projects/new')}
          />
        ) : (
          <>
            {[{ title: 'Active', list: active }, { title: 'Completed & archived', list: other }].map((section) =>
              section.list.length ? (
                <View key={section.title}>
                  <SectionHeader title={section.title} />
                  <View style={{ gap: 10 }}>
                    {section.list.map(({ project, total, done }, i) => (
                      <Card key={project.id} onPress={() => router.push(`/projects/${project.id}`)} accessibilityLabel={`${project.name}, ${done} of ${total} tasks done`}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: project.color ?? colors.categorical[i % colors.categorical.length] }} />
                          <Text variant="subheading" style={{ flex: 1 }} numberOfLines={1}>
                            {project.name}
                          </Text>
                          {project.status !== 'active' ? <Badge label={project.status} /> : null}
                        </View>
                        {project.description ? (
                          <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 6 }}>
                            {project.description}
                          </Text>
                        ) : null}
                        <View style={{ marginTop: 12, gap: 6 }}>
                          <ProgressBar value={total ? done / total : 0} label={`${project.name} progress`} />
                          <Text variant="small" color="textMuted">
                            {`${done}/${total} tasks done${project.deadline ? ` · due ${relativeDay(project.deadline)}` : ''}`}
                          </Text>
                        </View>
                      </Card>
                    ))}
                  </View>
                </View>
              ) : null,
            )}
          </>
        )}
      </Screen>
      <Fab label="New project" bottom={32} onPress={() => router.push('/projects/new')} />
    </View>
  );
}
