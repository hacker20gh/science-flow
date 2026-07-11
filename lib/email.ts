import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * 发送邮件（通过 Resend）
 *
 * 注意：Resend 免费版只能发送给已验证的邮箱。
 * 上线前需要在 Resend 仪表板绑定自定义域名（如 sciflow.ai），
 * 然后把 from 改为 noreply@sciflow.ai。
 */
export async function sendEmail({ to, subject, html, from }: SendEmailOptions) {
  const fromAddress = from || "SciFlow AI <onboarding@resend.dev>";

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return { success: false, error: err };
  }
}

// ---- SciFlow 常用邮件模板 ----

export const emailTemplates = {
  /** 项目协作邀请 */
  projectInvite(inviterName: string, projectName: string, inviteUrl: string) {
    return {
      subject: `${inviterName} 邀请你加入 SciFlow 项目「${projectName}」`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a56db;">SciFlow AI</h2>
          <p>你好！</p>
          <p><strong>${inviterName}</strong> 邀请你加入项目「<strong>${projectName}</strong>」。</p>
          <p>点击下方链接接受邀请：</p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: #1a56db; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            接受邀请
          </a>
          <p style="color: #666; font-size: 14px;">如果按钮无法点击，请复制链接：${inviteUrl}</p>
        </div>
      `,
    };
  },

  /** 论文导出完成通知 */
  manuscriptReady(userName: string, projectName: string, downloadUrl: string) {
    return {
      subject: `你的论文「${projectName}」已准备就绪`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a56db;">SciFlow AI</h2>
          <p>你好，${userName}！</p>
          <p>你的论文「<strong>${projectName}</strong>」已成功导出，可以下载了。</p>
          <a href="${downloadUrl}" style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            下载论文
          </a>
        </div>
      `,
    };
  },
};
