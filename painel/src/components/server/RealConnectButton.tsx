import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface RealConnectButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  host: string;
  port: number;
  label?: string;
}

/**
 * Igual ao `ConnectButton` mock, mas pegando host/porta direto em vez de um
 * `GameServer` inteiro — os servidores reais (`RealServer`) não têm os
 * campos que aquele componente espera (state, tags etc.), e widening o
 * contrato dele afetaria a Sidebar/SignalBar/ServerCard mockados também.
 */
export function RealConnectButton({
  host,
  port,
  label = "Conectar",
  className,
  variant = "outline",
  size = "md",
  ...rest
}: RealConnectButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const toast = useToast();
  const address = `${host}:${port}`;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function handleClick() {
    const command = `connect ${address}`;
    const ok = await copyText(command);
    if (!ok) {
      toast.error("Não foi possível copiar", "Use o endereço " + address);
      return;
    }
    toast.success("Endereço copiado", command);
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      icon={<Copy />}
      title={address}
      className={className}
      {...rest}
    >
      {copied ? "Copiado" : label}
    </Button>
  );
}
