'use client';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FolderOpen } from '@/components/ui/icon';
import { useTranslation } from '@/hooks/useTranslation';

interface ChatEmptyStateProps {
  hasDirectory: boolean;
  onSelectFolder: () => void;
  recentProjects?: string[];
  onSelectProject?: (path: string) => void;
}

export function ChatEmptyState({
  hasDirectory,
  onSelectFolder,
  recentProjects,
  onSelectProject,
}: ChatEmptyStateProps) {
  const { t } = useTranslation();

  if (hasDirectory) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{t('chat.empty.ready')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6">
        <Card className="cursor-pointer transition-colors hover:border-primary/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-primary" />
              <CardTitle className="text-base">{t('chat.empty.projectChat.title')}</CardTitle>
            </div>
            <CardDescription>{t('chat.empty.projectChat.description')}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size="sm" className="gap-1.5" onClick={onSelectFolder}>
              <FolderOpen size={14} />
              {t('chat.empty.selectFolder')}
            </Button>
          </CardFooter>
        </Card>

        {/* Recent projects */}
        {recentProjects && recentProjects.length > 0 && onSelectProject && (
          <div className="space-y-1.5 text-center">
            <p className="text-xs text-muted-foreground">{t('chat.empty.recentProjects')}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {recentProjects.slice(0, 5).map(p => {
                const name = p.split(/[\\/]/).filter(Boolean).pop() || p;
                return (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-mono"
                    onClick={() => onSelectProject(p)}
                    title={p}
                  >
                    {name}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
