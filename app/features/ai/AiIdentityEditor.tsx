import type { AiStudioController } from "./use-ai-studio";

export function AiIdentityEditor({ controller }: { controller: AiStudioController }) {
  return (
    <div className="ai-identity-grid">
      <fieldset>
        <legend>Paciente identificado</legend>
        <div>
          <label>Nombres<input value={controller.result.patient.firstNames} onChange={(event) => controller.updatePatient("firstNames", event.target.value)} /></label>
          <label>Apellidos<input value={controller.result.patient.lastNames} onChange={(event) => controller.updatePatient("lastNames", event.target.value)} /></label>
          <label>RUT<input value={controller.result.patient.rut} onChange={(event) => controller.updatePatient("rut", event.target.value)} /></label>
          <label>Fecha de nacimiento<input type="date" value={controller.result.patient.birthDate} onChange={(event) => controller.updatePatient("birthDate", event.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Profesional firmante</legend>
        <div>
          <label>Nombre y apellido<input value={controller.result.signer.name} onChange={(event) => controller.updateSigner("name", event.target.value)} /></label>
          <label>RUT<input value={controller.result.signer.rut} onChange={(event) => controller.updateSigner("rut", event.target.value)} /></label>
          <label className="wide">Especialidad<input value={controller.result.signer.specialty} onChange={(event) => controller.updateSigner("specialty", event.target.value)} /></label>
        </div>
      </fieldset>
      <label className="identity-confirmation">
        <input
          type="checkbox"
          checked={controller.identityConfirmed}
          onChange={(event) => controller.setIdentityConfirmed(event.target.checked)}
        />
        <span>Datos de identidad revisados</span>
      </label>
    </div>
  );
}
