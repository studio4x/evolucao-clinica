import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe2, Info, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../layout/AppVersion';
import { getInstalledAppInfo } from '../../utils/installedAppInfo';

const platformLabels = {
  android: 'Aplicativo Android',
  pwa: 'Aplicativo web instalado',
  web: 'Navegador web'
} as const;

export function AboutAppCard() {
  const [appInfo] = useState(getInstalledAppInfo);
  const isAndroid = appInfo.platform === 'android';

  return (
    <section className="card overflow-hidden bg-white shadow-sm border border-brand-border/60" aria-labelledby="about-app-title">
      <div className="h-1.5 bg-gradient-to-r from-brand-primary to-brand-accent" />

      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-brand-primary/10 bg-brand-primary/5 p-3 text-brand-primary shrink-0">
            <Info className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 id="about-app-title" className="text-xl font-display font-semibold text-brand-primary">
              Sobre o app
            </h2>
            <p className="text-sm text-brand-text-muted leading-relaxed max-w-2xl">
              O Evolução Clínica é uma plataforma inteligente de acompanhamento terapêutico criada para apoiar
              profissionais na organização de pacientes, no registro de sessões, na transcrição de áudios e na
              produção de documentos clínicos com mais agilidade e segurança.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-2xl border border-brand-border/70 bg-brand-bg/30 p-5 space-y-4">
            <div className="flex items-center gap-2">
              {isAndroid ? (
                <Smartphone className="h-5 w-5 text-brand-primary" aria-hidden="true" />
              ) : (
                <Globe2 className="h-5 w-5 text-brand-primary" aria-hidden="true" />
              )}
              <h3 className="text-sm font-semibold text-brand-primary">Versão em uso</h3>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-brand-border/60 bg-white p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">Ambiente</dt>
                <dd className="mt-1 text-xs font-semibold text-brand-text">{platformLabels[appInfo.platform]}</dd>
              </div>
              <div className="rounded-xl border border-brand-border/60 bg-white p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">App instalado</dt>
                <dd className="mt-1 text-xs font-semibold text-brand-primary">
                  {appInfo.displayVersion ? `v${appInfo.displayVersion}` : 'Não se aplica'}
                </dd>
              </div>
              <div className="rounded-xl border border-brand-border/60 bg-white p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">Build web</dt>
                <dd className="mt-1 text-xs font-semibold text-brand-primary">{APP_VERSION}</dd>
              </div>
            </dl>

            <p className="text-[11px] text-brand-text-muted leading-relaxed">
              {isAndroid
                ? `O código da versão instalada neste aparelho é ${appInfo.versionCode ?? 'indisponível'}. Esta informação ajuda a confirmar se a atualização recebida pela Play Store já foi instalada.`
                : 'A versão do aplicativo Android é exibida quando esta página é aberta pelo app instalado via Google Play.'}
            </p>
          </div>

          <div className="rounded-2xl border border-brand-primary/15 bg-gradient-to-br from-brand-primary/5 to-brand-accent/10 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-brand-primary">Tecnologia a serviço do cuidado</h3>
            </div>
            <p className="text-xs text-brand-text-muted leading-relaxed">
              Os recursos de inteligência artificial auxiliam o trabalho clínico, mas não substituem a avaliação,
              a revisão e a responsabilidade do profissional sobre cada registro produzido.
            </p>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>Privacidade, rastreabilidade e segurança fazem parte do desenvolvimento contínuo da plataforma.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-brand-border/50 pt-4 text-xs font-medium">
          <Link to="/privacy" className="inline-flex items-center gap-1.5 text-brand-primary hover:underline">
            Política de Privacidade
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <Link to="/terms" className="inline-flex items-center gap-1.5 text-brand-primary hover:underline">
            Termos de Serviço
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
