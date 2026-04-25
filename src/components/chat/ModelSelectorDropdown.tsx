'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CaretDown } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import { PromptInputButton } from '@/components/ai-elements/prompt-input';
import { BUILT_IN_MODELS, DEFAULT_MODEL_ID, getModelLabel, SELECTED_MODEL_STORAGE_KEY } from '@/lib/anthropic-models';
import {
  CommandList,
  CommandListSearch,
  CommandListItems,
  CommandListItem,
  CommandListGroup,
} from '@/components/patterns';

interface ModelSelectorDropdownProps {
  currentModelValue: string;
  onModelChange?: (model: string) => void;
}

export function ModelSelectorDropdown({
  currentModelValue,
  onModelChange,
}: ModelSelectorDropdownProps) {
  const { t } = useTranslation();
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  const effectiveModel = currentModelValue || DEFAULT_MODEL_ID;
  const currentLabel = getModelLabel(effectiveModel);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
        setModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelMenuOpen]);

  const handleSelect = useCallback((modelId: string) => {
    onModelChange?.(modelId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
    }
    setModelMenuOpen(false);
    setModelSearch('');
  }, [onModelChange]);

  const mq = modelSearch.toLowerCase();
  const filteredModels = BUILT_IN_MODELS.filter(
    (m) => !mq || m.label.toLowerCase().includes(mq) || m.id.toLowerCase().includes(mq),
  );

  return (
    <div className="relative" ref={modelMenuRef}>
      <PromptInputButton onClick={() => setModelMenuOpen((prev) => !prev)}>
        <span className="text-xs font-mono">{currentLabel}</span>
        <CaretDown size={10} className={cn('transition-transform duration-200', modelMenuOpen && 'rotate-180')} />
      </PromptInputButton>

      {modelMenuOpen && (
        <CommandList className="w-64 mb-1.5">
          <CommandListSearch
            placeholder={t('composer.searchModels' as TranslationKey)}
            value={modelSearch}
            onChange={setModelSearch}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setModelMenuOpen(false);
                setModelSearch('');
              }
            }}
          />
          <CommandListItems>
            <CommandListGroup label="Anthropic">
              <div className="py-0.5">
                {filteredModels.map((model) => {
                  const isActive = model.id === effectiveModel;
                  return (
                    <CommandListItem
                      key={model.id}
                      active={isActive}
                      onClick={() => handleSelect(model.id)}
                      className="justify-between"
                    >
                      <span className="font-mono text-xs flex items-center gap-1.5">
                        {model.label}
                      </span>
                      {isActive && <span className="text-xs">&#10003;</span>}
                    </CommandListItem>
                  );
                })}
              </div>
            </CommandListGroup>
            {filteredModels.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                No models found
              </div>
            )}
          </CommandListItems>
        </CommandList>
      )}
    </div>
  );
}
