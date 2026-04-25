#!/usr/bin/env node

import nodemailer from 'nodemailer';

const RECIPIENTS = ['victor@selva.agency'];
const FROM_EMAIL = 'reports@selva.agency';
const FROM_NAME = 'SELVA Agency Reports';

async function sendTestEmail() {
  try {
    console.log('[TEST] Inicializando Direct Transport (envia direto para MX)...');
    
    const transporter = nodemailer.createTransport({
      direct: true,
    });

    console.log('[TEST] ✓ Transporter inicializado');

    // Gerar HTML de teste
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Diário Meta Ads - TESTE</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f0e8;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background-color: #1a1a2e; padding: 24px; text-align: center; border-bottom: 4px solid #c9a96e;">
      <h1 style="margin: 0; color: #e8d5b7; font-size: 24px; font-weight: 700;">SELVA AGENCY</h1>
      <p style="margin: 8px 0 0 0; color: #c9a96e; font-size: 14px; font-weight: 500;">📊 Report Diário Meta Ads - TESTE</p>
      <p style="margin: 4px 0 0 0; color: #888888; font-size: 12px;">24 de Abril de 2026</p>
    </div>

    <!-- Summary -->
    <div style="padding: 24px; background-color: #fdf0f0;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Investimento Total</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">R$ 5.234,50</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">ROAS Médio</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">2.85x</p>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Conversões</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">127</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Receita</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">R$ 14.920,00</p>
        </div>
      </div>
    </div>

    <!-- Metrics Table -->
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a2e; font-size: 16px; font-weight: 700;">Performance por Conta (TESTE)</h2>
      <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #eeeeee; border-radius: 4px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f5f0e8; border-bottom: 2px solid #c9a96e;">
            <th style="padding: 12px; text-align: left; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Conta</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Invest.</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Conversões</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Receita</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">ROAS</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #eeeeee;">
            <td style="padding: 12px; color: #1a1a2e; font-weight: 500;">Conta Teste 1</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">R$ 3.000,00</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">75</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">R$ 8.500,00</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">2.83x</td>
          </tr>
          <tr style="border-bottom: 1px solid #eeeeee;">
            <td style="padding: 12px; color: #1a1a2e; font-weight: 500;">Conta Teste 2</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">R$ 2.234,50</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">52</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">R$ 6.420,00</td>
            <td style="padding: 12px; color: #1a1a2e; text-align: right;">2.87x</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Analysis -->
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a2e; font-size: 16px; font-weight: 700;">Análise de Performance</h2>
      <div style="margin-bottom: 16px; padding: 12px; background: #ffffff; border-left: 4px solid #c9a96e; border-radius: 4px;">
        <p style="margin: 0; color: #1a1a2e; font-size: 14px; line-height: 1.6;">
          A conta Conta Teste 1 teve ROAS de 2.83x ontem com R$ 3.000,00 investidos, gerando R$ 8.500,00 em receita. Performance boa com taxa de cliques forte (1.25%). Recomenda-se manter ou aumentar o orçamento.
        </p>
      </div>
      <div style="margin-bottom: 16px; padding: 12px; background: #ffffff; border-left: 4px solid #c9a96e; border-radius: 4px;">
        <p style="margin: 0; color: #1a1a2e; font-size: 14px; line-height: 1.6;">
          A conta Conta Teste 2 teve ROAS de 2.87x ontem com R$ 2.234,50 investidos, gerando R$ 6.420,00 em receita. Performance boa com taxa de cliques forte (1.30%). Recomenda-se manter ou aumentar o orçamento.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f0e8; padding: 24px; text-align: center; border-top: 1px solid #eeeeee;">
      <p style="margin: 0; color: #888888; font-size: 12px;">
        Report gerado automaticamente às 8h BRT • SELVA Agency
      </p>
      <p style="margin: 8px 0 0 0; color: #888888; font-size: 11px;">
        ⚠️ ESTE É UM EMAIL DE TESTE - Dados simulados para validação do sistema
      </p>
    </div>
  </div>
</body>
</html>
    `;

    console.log('[TEST] Enviando email de teste...');

    for (const recipient of RECIPIENTS) {
      try {
        const info = await transporter.sendMail({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: recipient,
          subject: '[SELVA] Report Diário Meta Ads — TESTE',
          html: htmlContent,
          text: 'Este é um email de teste do sistema de relatório diário. Dados simulados.',
        });

        console.log(`[TEST] ✓ Email enviado para ${recipient}`);
        console.log(`[TEST] Message ID: ${info.messageId}`);
        console.log(`[TEST] Response: ${JSON.stringify(info.response)}`);
      } catch (error) {
        console.error(`[TEST] ✗ Erro ao enviar para ${recipient}:`, error.message);
      }
    }

    console.log('[TEST] ✓ Teste concluído!');
  } catch (error) {
    console.error('[TEST] ✗ Erro:', error.message);
    process.exit(1);
  }
}

sendTestEmail();
