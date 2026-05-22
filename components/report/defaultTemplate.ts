import type { ReportTemplate } from '../../types';

const uid = () => Math.random().toString(36).slice(2, 9);

export function buildDefaultTemplate(): ReportTemplate {
  return {
    name: 'Foundation Types Report',
    multiValueStrategy: 'first',
    groups: [
      {
        id: uid(),
        name: 'HashiraGata Dimension',
        color: 'blue',
        params: [
          { id: uid(), label: '柱型_Lx', sourceField: 'dimensionWidth' },
          { id: uid(), label: '柱型_Ly', sourceField: 'dimensionHeight' },
        ],
      },
      {
        id: uid(),
        name: 'HashiraGata Main Rebar',
        color: 'orange',
        params: [
          { id: uid(), label: '柱型_主筋_本数', sourceField: 'mainReinforcementCount' },
          { id: uid(), label: '柱型_主筋_直径', sourceField: 'mainReinforcementSize' },
        ],
      },
      {
        id: uid(),
        name: 'HashiraGata Hoop Rebar',
        color: 'yellow',
        params: [
          { id: uid(), label: '柱型_Hoop_直径', sourceField: 'hoopReinforcementSize' },
          { id: uid(), label: '柱型_Hoop_距離_最大', sourceField: 'hoopReinforcementSpacing' },
        ],
      },
    ],
  };
}
