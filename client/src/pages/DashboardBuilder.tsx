/**
 * DashboardBuilder.tsx — Módulo independente de geração de dashboards analíticos.
 * Não interfere com nenhuma funcionalidade existente da plataforma.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Upload,
  X,
  FileText,
  Clock,
  Trash2,
  ExternalLink,
  Loader2,
  ImageIcon,
  ChevronRight,
  BarChart2,
  GitCompare,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

// ─── Upload de imagem para S3 ─────────────────────────────────────────────────

async function uploadImageToS3(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/dashboard-builder/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Falha no upload da imagem");
  }
  const data = await res.json();
  return data.url as string;
}

// ─── Máscara de data dd/mm/aaaa ───────────────────────────────────────────────

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidDate(value: string): boolean {
  if (value.length !== 10) return false;
  const [d, m, y] = value.split("/").map(Number);
  if (!d || !m || !y) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2020 || y > 2099) return false;
  return true;
}

// ─── Componente de campo de data ──────────────────────────────────────────────

function DateField({
  label,
  value,
  onChange,
  disabled,
  placeholder = "dd/mm/aaaa",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const valid = value.length === 0 || isValidDate(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Calendar size={12} />
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(maskDate(e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className={`font-mono text-sm ${!valid && value.length > 0 ? "border-destructive" : ""}`}
      />
      {!valid && value.length > 0 && (
        <p className="text-xs text-destructive">Data inválida</p>
      )}
    </div>
  );
}

// ─── Componente de upload de imagem ──────────────────────────────────────────

function ImageUploadSlot({
  label,
  sublabel,
  file,
  preview,
  onSelect,
  onRemove,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  preview: string | null;
  onSelect: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onSelect(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      <p className="text-xs text-muted-foreground -mt-1">{sublabel}</p>
      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
          <img src={preview} alt={label} className="w-full h-40 object-contain" />
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 bg-background/90 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X size={14} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-3 py-1.5">
            <p className="text-xs text-muted-foreground truncate">{file?.name}</p>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg h-40 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <ImageIcon size={28} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardBuilder() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"SINGLE" | "COMPARATIVE">("SINGLE");
  const [clientName, setClientName] = useState("");
  const [weeklyContext, setWeeklyContext] = useState("");

  // Datas — modo único: apenas dateSingle; modo comparativo: dateCurrent + datePrevious
  const [dateSingle, setDateSingle] = useState("");
  const [dateCurrent, setDateCurrent] = useState("");
  const [datePrevious, setDatePrevious] = useState("");

  const [file1, setFile1] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const utils = trpc.useUtils();

  const { data: reports, isLoading: loadingReports } = trpc.dashboardBuilder.list.useQuery();

  const generateMutation = trpc.dashboardBuilder.generate.useMutation({
    onSuccess: (data) => {
      utils.dashboardBuilder.list.invalidate();
      toast.success("Dashboard gerado com sucesso!");
      navigate(`/dashboard-builder/${data.id}`);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar dashboard: ${err.message}`);
      setIsGenerating(false);
    },
  });

  const deleteMutation = trpc.dashboardBuilder.delete.useMutation({
    onSuccess: () => {
      utils.dashboardBuilder.list.invalidate();
      toast.success("Relatório excluído");
    },
  });

  const handleSelectFile1 = (f: File) => {
    setFile1(f);
    setPreview1(URL.createObjectURL(f));
  };
  const handleSelectFile2 = (f: File) => {
    setFile2(f);
    setPreview2(URL.createObjectURL(f));
  };

  // Monta a string de período para enviar ao LLM
  const buildPeriodString = (): string => {
    if (mode === "SINGLE") {
      return dateSingle ? `Período: ${dateSingle}` : "";
    }
    const parts: string[] = [];
    if (dateCurrent) parts.push(`Período atual: ${dateCurrent}`);
    if (datePrevious) parts.push(`Período anterior: ${datePrevious}`);
    return parts.join(" | ");
  };

  const handleGenerate = async () => {
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!weeklyContext.trim()) {
      toast.error("Informe o contexto semanal");
      return;
    }
    if (mode === "SINGLE" && !file1) {
      toast.error("Selecione ao menos 1 print de campanha");
      return;
    }
    if (mode === "COMPARATIVE" && (!file1 || !file2)) {
      toast.error("No modo comparativo, selecione os 2 prints");
      return;
    }

    // Validar datas preenchidas
    if (mode === "SINGLE" && dateSingle && !isValidDate(dateSingle)) {
      toast.error("Data inválida no campo de período");
      return;
    }
    if (mode === "COMPARATIVE") {
      if (dateCurrent && !isValidDate(dateCurrent)) {
        toast.error("Data inválida no campo 'Período Atual'");
        return;
      }
      if (datePrevious && !isValidDate(datePrevious)) {
        toast.error("Data inválida no campo 'Período Anterior'");
        return;
      }
    }

    setIsGenerating(true);
    try {
      const imageUrls: string[] = [];
      if (file1) {
        toast.info("Enviando imagem 1...");
        const url1 = await uploadImageToS3(file1);
        imageUrls.push(url1);
      }
      if (file2 && mode === "COMPARATIVE") {
        toast.info("Enviando imagem 2...");
        const url2 = await uploadImageToS3(file2);
        imageUrls.push(url2);
      }

      const periodString = buildPeriodString();
      const contextWithPeriod = periodString
        ? `${periodString}\n\n${weeklyContext.trim()}`
        : weeklyContext.trim();

      toast.info("Analisando campanhas com IA...");
      await generateMutation.mutateAsync({
        clientName: clientName.trim(),
        weeklyContext: contextWithPeriod,
        mode,
        imageUrls,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro inesperado");
      setIsGenerating(false);
    }
  };

  const contextWordCount = weeklyContext.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10">
          <LayoutDashboard size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gere dashboards analíticos profissionais a partir dos prints do gerenciador de anúncios
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ─── Formulário ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo Dashboard</CardTitle>
              <CardDescription>Preencha os dados abaixo para gerar a análise</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Modo */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Modo de Operação</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setMode("SINGLE"); setFile2(null); setPreview2(null); setDateCurrent(""); setDatePrevious(""); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "SINGLE"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <BarChart2 size={18} className={mode === "SINGLE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "SINGLE" ? "text-primary" : "text-foreground"}`}>
                        Período Único
                      </p>
                      <p className="text-xs text-muted-foreground">1 print, sem comparativo</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setMode("COMPARATIVE"); setDateSingle(""); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "COMPARATIVE"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <GitCompare size={18} className={mode === "COMPARATIVE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "COMPARATIVE" ? "text-primary" : "text-foreground"}`}>
                        Comparativo
                      </p>
                      <p className="text-xs text-muted-foreground">2 prints com variação %</p>
                    </div>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Nome do cliente */}
              <div className="space-y-2">
                <Label htmlFor="clientName" className="text-sm font-semibold">
                  Nome do Cliente <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="clientName"
                  placeholder="Ex: Empresa XYZ"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              {/* Campos de data */}
              {mode === "SINGLE" ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Período Analisado</Label>
                  <DateField
                    label="Data do período (opcional)"
                    value={dateSingle}
                    onChange={setDateSingle}
                    disabled={isGenerating}
                    placeholder="dd/mm/aaaa"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se o print não mostrar a data, informe aqui para constar no relatório.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Datas dos Períodos</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <DateField
                      label="Data — Período Atual"
                      value={dateCurrent}
                      onChange={setDateCurrent}
                      disabled={isGenerating}
                      placeholder="dd/mm/aaaa"
                    />
                    <DateField
                      label="Data — Período Anterior"
                      value={datePrevious}
                      onChange={setDatePrevious}
                      disabled={isGenerating}
                      placeholder="dd/mm/aaaa"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe as datas para que o relatório identifique corretamente os períodos comparados.
                  </p>
                </div>
              )}

              {/* Contexto semanal */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="context" className="text-sm font-semibold">
                    Contexto Semanal <span className="text-destructive">*</span>
                  </Label>
                  <span className={`text-xs ${contextWordCount < 20 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {contextWordCount} palavras {contextWordCount < 20 && "— mínimo recomendado: 20"}
                  </span>
                </div>
                <Textarea
                  id="context"
                  placeholder="Descreva o que foi feito, alterado, testado, pausado ou lançado na semana. Quanto mais detalhado, mais precisa será a análise."
                  value={weeklyContext}
                  onChange={(e) => setWeeklyContext(e.target.value)}
                  rows={4}
                  disabled={isGenerating}
                  className="resize-none"
                />
                {contextWordCount < 20 && contextWordCount > 0 && (
                  <p className="text-xs text-amber-500">
                    ⚠️ Contexto reduzido. A análise pode ser mais superficial.
                  </p>
                )}
              </div>

              <Separator />

              {/* Upload de imagens */}
              <div className="space-y-4">
                <Label className="text-sm font-semibold">
                  Print(s) do Gerenciador <span className="text-destructive">*</span>
                </Label>
                <div className={`grid gap-4 ${mode === "COMPARATIVE" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <ImageUploadSlot
                    label={mode === "COMPARATIVE" ? "Print — Período Atual" : "Print das Campanhas"}
                    sublabel={mode === "COMPARATIVE" ? "Screenshot do período de referência" : "Screenshot do gerenciador de anúncios"}
                    file={file1}
                    preview={preview1}
                    onSelect={handleSelectFile1}
                    onRemove={() => { setFile1(null); setPreview1(null); }}
                  />
                  {mode === "COMPARATIVE" && (
                    <ImageUploadSlot
                      label="Print — Período Anterior"
                      sublabel="Para cálculo de variação %"
                      file={file2}
                      preview={preview2}
                      onSelect={handleSelectFile2}
                      onRemove={() => { setFile2(null); setPreview2(null); }}
                    />
                  )}
                </div>
              </div>

              {/* Botão gerar */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Gerando dashboard...
                  </>
                ) : (
                  <>
                    <LayoutDashboard size={16} className="mr-2" />
                    Gerar Dashboard
                  </>
                )}
              </Button>

              {isGenerating && (
                <p className="text-xs text-center text-muted-foreground">
                  A análise pode levar entre 15 e 60 segundos dependendo do volume de campanhas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Histórico ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Dashboards Gerados</h2>
            {reports && reports.length > 0 && (
              <Badge variant="secondary">{reports.length}</Badge>
            )}
          </div>

          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <FileText size={32} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhum dashboard gerado ainda. Preencha o formulário e clique em Gerar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <Card
                  key={r.id}
                  className="hover:border-primary/40 transition-colors cursor-pointer group"
                  onClick={() => r.status === "DONE" && navigate(`/dashboard-builder/${r.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {r.clientName}
                          </p>
                          <Badge
                            variant={
                              r.status === "DONE"
                                ? "default"
                                : r.status === "ERROR"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs shrink-0"
                          >
                            {r.status === "DONE"
                              ? "Pronto"
                              : r.status === "ERROR"
                              ? "Erro"
                              : r.status === "PROCESSING"
                              ? "Processando..."
                              : "Pendente"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(r.createdAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {r.platform && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                              {r.platform}
                            </span>
                          )}
                          <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                            {r.mode === "COMPARATIVE" ? "Comparativo" : "Período Único"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.status === "DONE" && (
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground group-hover:text-primary transition-colors"
                          />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate({ id: r.id });
                          }}
                          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {r.status === "ERROR" && r.errorMessage && (
                      <p className="text-xs text-destructive mt-2 line-clamp-2">{r.errorMessage}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
