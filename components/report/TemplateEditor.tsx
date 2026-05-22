import React, { useState } from 'react';
import type { GroupColor, ReportTemplate, SourceField, TemplateGroup, TemplateParam } from '../../types';
import { buildDefaultTemplate } from './defaultTemplate';

const SOURCE_FIELD_OPTIONS: { value: SourceField; label: string }[] = [
  { value: 'columnType', label: 'Column Type (柱符号)' },
  { value: 'dimensionWidth', label: '柱型_Lx' },
  { value: 'dimensionHeight', label: '柱型_Ly' },
  { value: 'mainReinforcementCount', label: '柱型_主筋_本数' },
  { value: 'mainReinforcementSize', label: '柱型_主筋_直径' },
  { value: 'hoopReinforcementSize', label: '柱型_Hoop_直径' },
  { value: 'hoopReinforcementSpacing', label: '柱型_Hoop_距離_最大' },
  { value: 'bColumn', label: '柱_Lx' },
  { value: 'hColumn', label: '柱_Ly' },
];

const COLOR_OPTIONS: { value: GroupColor; bg: string; ring: string }[] = [
  { value: 'blue', bg: 'bg-blue-400', ring: 'ring-blue-500' },
  { value: 'green', bg: 'bg-green-400', ring: 'ring-green-500' },
  { value: 'yellow', bg: 'bg-yellow-400', ring: 'ring-yellow-500' },
  { value: 'orange', bg: 'bg-orange-400', ring: 'ring-orange-500' },
  { value: 'purple', bg: 'bg-purple-400', ring: 'ring-purple-500' },
  { value: 'pink', bg: 'bg-pink-400', ring: 'ring-pink-500' },
  { value: 'teal', bg: 'bg-teal-400', ring: 'ring-teal-500' },
  { value: 'indigo', bg: 'bg-indigo-400', ring: 'ring-indigo-500' },
];

const GROUP_DOT: Record<GroupColor, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
  teal: 'bg-teal-400',
  indigo: 'bg-indigo-400',
};

const uid = () => Math.random().toString(36).slice(2, 9);

interface Props {
  template: ReportTemplate;
  onChange: (template: ReportTemplate) => void;
}

export const TemplateEditor: React.FC<Props> = ({ template, onChange }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(template.groups.map((g) => g.id)),
  );

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const update = (patch: Partial<ReportTemplate>) => onChange({ ...template, ...patch });

  const updateGroup = (id: string, patch: Partial<TemplateGroup>) =>
    update({ groups: template.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  const deleteGroup = (id: string) => update({ groups: template.groups.filter((g) => g.id !== id) });

  const moveGroup = (id: string, dir: -1 | 1) => {
    const idx = template.groups.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= template.groups.length) return;
    const groups = [...template.groups];
    [groups[idx], groups[newIdx]] = [groups[newIdx], groups[idx]];
    update({ groups });
  };

  const addGroup = () => {
    const id = uid();
    const newGroup: TemplateGroup = { id, name: 'New Group', color: 'blue', params: [] };
    update({ groups: [...template.groups, newGroup] });
    setExpandedGroups((prev) => new Set([...prev, id]));
  };

  const updateParam = (groupId: string, paramId: string, patch: Partial<TemplateParam>) => {
    const group = template.groups.find((g) => g.id === groupId)!;
    updateGroup(groupId, { params: group.params.map((p) => (p.id === paramId ? { ...p, ...patch } : p)) });
  };

  const deleteParam = (groupId: string, paramId: string) => {
    const group = template.groups.find((g) => g.id === groupId)!;
    updateGroup(groupId, { params: group.params.filter((p) => p.id !== paramId) });
  };

  const moveParam = (groupId: string, paramId: string, dir: -1 | 1) => {
    const group = template.groups.find((g) => g.id === groupId)!;
    const idx = group.params.findIndex((p) => p.id === paramId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= group.params.length) return;
    const params = [...group.params];
    [params[idx], params[newIdx]] = [params[newIdx], params[idx]];
    updateGroup(groupId, { params });
  };

  const addParam = (groupId: string) => {
    const group = template.groups.find((g) => g.id === groupId)!;
    const newParam: TemplateParam = { id: uid(), label: 'New Parameter', sourceField: 'dimensionWidth' };
    updateGroup(groupId, { params: [...group.params, newParam] });
  };

  const resetToDefault = () => {
    const fresh = buildDefaultTemplate();
    onChange(fresh);
    setExpandedGroups(new Set(fresh.groups.map((g) => g.id)));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Template Configuration</h3>
        <button
          onClick={resetToDefault}
          className="text-xs text-gray-500 hover:text-red-600 transition-colors"
        >
          Reset to default
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Template Name</label>
          <input
            type="text"
            value={template.name}
            onChange={(e) => update({ name: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Multi-value Strategy</label>
          <select
            value={template.multiValueStrategy}
            onChange={(e) =>
              update({ multiValueStrategy: e.target.value as ReportTemplate['multiValueStrategy'] })
            }
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="first">First occurrence</option>
            <option value="most-common">Most common</option>
            <option value="largest">Largest (numeric)</option>
            <option value="all">Show all (concatenate)</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {template.groups.map((group, gi) => {
          const isExpanded = expandedGroups.has(group.id);
          const dotClass = GROUP_DOT[group.color] ?? GROUP_DOT.blue;
          return (
            <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Group header */}
              <div className="bg-gray-50 px-3 py-2 flex items-center gap-2">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                <div className="flex items-center gap-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => updateGroup(group.id, { color: c.value })}
                      className={`w-3.5 h-3.5 rounded-full ${c.bg} transition-all ${
                        group.color === c.value
                          ? `ring-2 ring-offset-1 ${c.ring}`
                          : 'opacity-50 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>

                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                  className="flex-1 text-sm font-medium border-none bg-transparent focus:outline-none focus:bg-white focus:border focus:border-gray-300 focus:rounded px-1 py-0.5 min-w-0"
                />

                <span className="text-xs text-gray-400 flex-shrink-0">{group.params.length} params</span>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => moveGroup(group.id, -1)}
                    disabled={gi === 0}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveGroup(group.id, 1)}
                    disabled={gi === template.groups.length - 1}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteGroup(group.id)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete group"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Parameters */}
              {isExpanded && (
                <div className="divide-y divide-gray-100">
                  {group.params.map((param, pi) => (
                    <div key={param.id} className="px-3 py-2 flex items-center gap-2 bg-white hover:bg-gray-50">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                      <input
                        type="text"
                        value={param.label}
                        onChange={(e) => updateParam(group.id, param.id, { label: e.target.value })}
                        className="w-44 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
                        placeholder="Label"
                      />
                      <select
                        value={param.sourceField}
                        onChange={(e) =>
                          updateParam(group.id, param.id, { sourceField: e.target.value as SourceField })
                        }
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
                      >
                        {SOURCE_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => moveParam(group.id, param.id, -1)}
                          disabled={pi === 0}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveParam(group.id, param.id, 1)}
                          disabled={pi === group.params.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteParam(group.id, param.id)}
                          className="p-0.5 text-gray-400 hover:text-red-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2">
                    <button
                      onClick={() => addParam(group.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                      </svg>
                      Add parameter
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addGroup}
        className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors flex items-center justify-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        Add Group
      </button>
    </div>
  );
};
