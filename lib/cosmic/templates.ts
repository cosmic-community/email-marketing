import { EmailTemplate, CreateTemplateData } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

// Email Templates
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "email-templates" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return objects as EmailTemplate[];
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching email templates:", error);
    throw new Error("Failed to fetch email templates");
  }
}

export async function getEmailTemplate(
  id: string
): Promise<EmailTemplate | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return object as EmailTemplate;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching email template ${id}:`, error);
    throw new Error("Failed to fetch email template");
  }
}

export async function createEmailTemplate(
  data: CreateTemplateData
): Promise<EmailTemplate> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: "email-templates",
      metadata: {
        name: data.name,
        subject: data.subject,
        content: data.content,
        template_type: {
          key: data.template_type.toLowerCase().replace(" ", "_"),
          value: data.template_type,
        },
        active: data.active,
      },
    });

    return object as EmailTemplate;
  } catch (error) {
    console.error("Error creating email template:", error);
    throw new Error("Failed to create email template");
  }
}

export async function updateEmailTemplate(
  id: string,
  data: Partial<CreateTemplateData>
): Promise<EmailTemplate> {
  try {
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.title = data.name;
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (data.name !== undefined) metadataUpdates.name = data.name;
    if (data.subject !== undefined) metadataUpdates.subject = data.subject;
    if (data.content !== undefined) metadataUpdates.content = data.content;
    if (data.active !== undefined) metadataUpdates.active = data.active;

    if (data.template_type !== undefined) {
      metadataUpdates.template_type = {
        key: data.template_type.toLowerCase().replace(" ", "_"),
        value: data.template_type,
      };
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }

    const { object } = await cosmic.objects.updateOne(id, updateData);
    return object as EmailTemplate;
  } catch (error) {
    console.error(`Error updating email template ${id}:`, error);
    throw new Error("Failed to update email template");
  }
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting email template ${id}:`, error);
    throw new Error("Failed to delete email template");
  }
}

export async function duplicateEmailTemplate(
  id: string
): Promise<EmailTemplate> {
  try {
    const original = await getEmailTemplate(id);
    if (!original) {
      throw new Error("Original template not found");
    }

    const duplicatedData: CreateTemplateData = {
      name: `${original.metadata.name} (Copy)`,
      subject: original.metadata.subject,
      content: original.metadata.content,
      template_type: original.metadata.template_type.value,
      active: original.metadata.active,
    };

    return await createEmailTemplate(duplicatedData);
  } catch (error) {
    console.error(`Error duplicating email template ${id}:`, error);
    throw new Error("Failed to duplicate email template");
  }
}

