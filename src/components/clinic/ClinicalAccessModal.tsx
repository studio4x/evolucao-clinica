import { useEffect, useRef } from "react";
import { CheckCircle2, CircleSlash, Info, Loader2, Stethoscope, X } from "lucide-react";
import type { ClinicTeamMember } from "../../services/clinicTeam";

type ClinicalAccessModalProps = {
  memberName: string;
  memberRole: ClinicTeamMember["membership_role"];
  contractedSeats: number;
  activeSeats: number;
  availableSeats: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const roleLabel = (role: ClinicalAccessModalProps["memberRole"]) => (
  role === "owner" ? "Proprietário" : role === "manager" ? "Gestor" : "Profissional"
);

export function ClinicalAccessModal({ memberName, memberRole, contractedSeats, activeSeats, availableSeats, busy, onClose, onConfirm }: ClinicalAccessModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const safeAvailableSeats = Math.max(0, availableSeats);
  const afterActivation = Math.max(0, safeAvailableSeats - 1);
  const isAdministrative = memberRole === "owner" || memberRole === "manager";

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinical-access-modal-title"
        aria-describedby="clinical-access-modal-description"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-primary">Acesso da equipe</p>
            <h2 id="clinical-access-modal-title" className="mt-2 text-2xl font-bold text-brand-primary">Habilitar acesso clínico</h2>
            <p id="clinical-access-modal-description" className="mt-2 text-sm text-brand-text-muted">Entenda o que muda antes de liberar este acesso para {memberName}.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-brand-border p-2 text-brand-text-muted transition hover:bg-brand-bg disabled:cursor-wait disabled:opacity-50" aria-label="Fechar">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-brand-primary/20 bg-brand-bg/50 p-4 text-sm leading-6 text-brand-text">
          <p>O acesso clínico permite que este membro atue como profissional nos pacientes da clínica para os quais estiver atribuído.</p>
          <p className="mt-2 font-semibold text-brand-primary">Habilitar o acesso clínico, por si só, não libera todos os pacientes da clínica.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <AccessCard title="Com acesso clínico" icon={<Stethoscope size={20} aria-hidden="true" />} tone="positive">
            <li>Utiliza 1 licença clínica.</li>
            <li>Pode ser atribuído aos pacientes da clínica.</li>
            <li>Pode registrar suas próprias evoluções quando sua atribuição permitir.</li>
            <li>Não ganha permissão para alterar registros de outros profissionais.</li>
          </AccessCard>
          <AccessCard title="Sem acesso clínico" icon={<CircleSlash size={20} aria-hidden="true" />} tone="neutral">
            <li>Não utiliza licença clínica.</li>
            <li>Não atua como profissional responsável pelos pacientes.</li>
            <li>Não cria evoluções clínicas.</li>
          </AccessCard>
        </div>

        {isAdministrative && (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
            <div className="flex items-center gap-2 font-bold text-brand-primary"><Info size={19} aria-hidden="true" />Para administradores da clínica</div>
            <p className="mt-3">Como {roleLabel(memberRole)}, este membro continua podendo gerenciar a clínica e consultar os registros dos pacientes mesmo sem acesso clínico. A habilitação é necessária apenas quando ele também precisar atuar como profissional clínico.</p>
            <p className="mt-2">Sem acesso clínico, o administrador não atua como profissional responsável pelo paciente e não cria suas próprias evoluções.</p>
            <p className="mt-2">Com acesso clínico habilitado, ele também passa a ocupar uma licença e poderá atuar clinicamente somente nos pacientes aos quais estiver atribuído.</p>
          </div>
        )}

        <div className={`mt-5 rounded-2xl border p-4 ${safeAvailableSeats > 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {safeAvailableSeats > 0 ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={20} aria-hidden="true" /> : <Info className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />}
            <div className="min-w-0 flex-1 text-sm text-brand-text">
              <p className="font-bold">Licenças clínicas</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SeatValue label="Contratadas" value={contractedSeats} />
                <SeatValue label="Em uso" value={activeSeats} />
                <SeatValue label="Licenças disponíveis" value={safeAvailableSeats} />
                <SeatValue label="Após ativação" value={afterActivation} />
              </dl>
              {safeAvailableSeats < 1 && <p className="mt-3 font-semibold text-amber-900">Não há licenças disponíveis no momento.</p>}
              {safeAvailableSeats < 1 && <p className="mt-1 text-amber-900">Para liberar este acesso será necessário adicionar uma licença ao Plano Clínica.</p>}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-brand-border px-5 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-bg disabled:cursor-wait disabled:opacity-50">Fechar</button>
          <button type="button" onClick={onConfirm} disabled={busy || safeAvailableSeats < 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <Loader2 className="animate-spin" size={17} aria-hidden="true" />}
            Habilitar acesso clínico
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessCard({ title, icon, tone, children }: { title: string; icon: React.ReactNode; tone: "positive" | "neutral"; children: React.ReactNode }) {
  return <div className={`rounded-2xl border p-4 ${tone === "positive" ? "border-emerald-200 bg-emerald-50/70" : "border-brand-border bg-slate-50"}`}><div className="flex items-center gap-2 font-bold text-brand-primary">{icon}{title}</div><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-5 text-brand-text">{children}</ul></div>;
}

function SeatValue({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-xs text-brand-text-muted">{label}</dt><dd className="mt-1 text-lg font-bold text-brand-text">{value}</dd></div>;
}
