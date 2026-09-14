import React from 'react';
import { UploadCloud, Table, Bot, FileCheck, Check } from 'lucide-react';

export function WorkflowStepper({ currentStep, onStepClick, hasData }) {
  const steps = [
    {
      id: 1,
      name: 'Carga de Archivo',
      desc: 'Importación SIGA / Altas CAS',
      icon: UploadCloud
    },
    {
      id: 2,
      name: 'Padrón SIGA',
      desc: 'Visualización y filtros iniciales',
      icon: Table
    },
    {
      id: 3,
      name: 'Verificación SBS',
      desc: 'Bot automatizado en vivo',
      icon: Bot
    },
    {
      id: 4,
      name: 'Resultados y Reporte',
      desc: 'Semáforos y discrepancias',
      icon: FileCheck
    }
  ];

  return (
    <nav className="mpfn-stepper-container" aria-label="Flujo de verificación">
      <div className="mpfn-stepper">
        {steps.map((step, index) => {
          const isDone = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isAccessible = step.id === 1 || hasData;
          const state = isDone ? 'done' : isActive ? 'active' : 'todo';
          const Icon = step.icon;

          return (
            <React.Fragment key={step.id}>
              <div
                className={`mpfn-step ${isAccessible ? 'is-clickable' : 'is-disabled'}`}
                data-state={state}
                onClick={() => isAccessible && onStepClick(step.id)}
                role="button"
                tabIndex={isAccessible ? 0 : -1}
                title={!isAccessible ? 'Cargue un archivo para acceder a este paso' : ''}
              >
                <div className="mpfn-step-core">
                  <div className="mpfn-step-circle">
                    {isDone ? <Check size={16} /> : <Icon size={15} />}
                  </div>
                  <div className="mpfn-step-labels">
                    <span className="mpfn-step-title">{step.name}</span>
                    <span className="mpfn-step-desc">{step.desc}</span>
                  </div>
                </div>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={`mpfn-step-line ${currentStep > index + 1 ? 'is-done' : ''}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}
