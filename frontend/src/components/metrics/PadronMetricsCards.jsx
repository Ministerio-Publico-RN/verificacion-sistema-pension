import React, { useMemo } from 'react';
import { Users, Landmark, HelpCircle } from 'lucide-react';

export function PadronMetricsCards({ workers, activeFilter, onFilterChange }) {
  const breakdown = useMemo(() => {
    let snp = 0;
    let integra = 0;
    let prima = 0;
    let profuturo = 0;
    let habitat = 0;
    let enBlanco = 0;

    for (const w of workers) {
      const reg = (w.previsiona_siga || '').toUpperCase().trim();
      if (!reg || reg === '-' || reg === 'SIN REGIMEN' || reg === 'SIN REGISTRO') {
        enBlanco++;
      } else if (reg.includes('SNP') || reg.includes('ONP') || reg.includes('19990')) {
        snp++;
      } else if (reg.includes('INTEGRA')) {
        integra++;
      } else if (reg.includes('PRIMA')) {
        prima++;
      } else if (reg.includes('PROFUTURO')) {
        profuturo++;
      } else if (reg.includes('HABITAT')) {
        habitat++;
      } else {
        enBlanco++;
      }
    }

    return {
      total: workers.length,
      snp,
      integra,
      prima,
      profuturo,
      habitat,
      enBlanco
    };
  }, [workers]);

  const cards = [
    { id: 'all', title: 'Total Registros', count: breakdown.total, icon: Users, color: 'metric-total' },
    { id: 'filter_snp', title: 'SNP (ONP)', count: breakdown.snp, icon: Landmark, color: 'metric-snp' },
    { id: 'filter_integra', title: 'AFP Integra', count: breakdown.integra, color: 'metric-spp' },
    { id: 'filter_prima', title: 'AFP Prima', count: breakdown.prima, color: 'metric-spp' },
    { id: 'filter_profuturo', title: 'AFP Profuturo', count: breakdown.profuturo, color: 'metric-spp' },
    { id: 'filter_habitat', title: 'AFP Habitat', count: breakdown.habitat, color: 'metric-spp' },
    { id: 'filter_blanco', title: 'Sin Régimen / En blanco', count: breakdown.enBlanco, icon: HelpCircle, color: 'metric-alert' }
  ];

  return (
    <div className="mpfn-padron-grid">
      {cards.map((card) => {
        const isSelected = activeFilter === card.id;
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className={`mpfn-padron-card ${card.color} ${isSelected ? 'is-active' : ''}`}
            onClick={() => onFilterChange(card.id)}
            role="button"
            tabIndex={0}
            title={`Filtrar por ${card.title}`}
          >
            <div className="padron-card-header">
              <span className="padron-card-title">{card.title}</span>
              {Icon && <Icon size={14} className="padron-card-icon" />}
            </div>
            <div className="padron-card-value">{card.count}</div>
          </div>
        );
      })}
    </div>
  );
}
