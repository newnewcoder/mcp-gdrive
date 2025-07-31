import { google } from "googleapis";
import { GDocsGetSuggestionsInput, InternalToolResponse } from "./types.js";

export const schema = {
  name: "gdocs_get_suggestions",
  description: "Get suggestions from a Google Document",
  inputSchema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "ID of the Google Document to get suggestions from",
      },
    },
    required: ["documentId"],
  },
} as const;

export async function getSuggestions(
  args: GDocsGetSuggestionsInput,
): Promise<InternalToolResponse> {
  const docs = google.docs("v1");
  
  try {
    const response = await docs.documents.get({
      documentId: args.documentId,
      suggestionsViewMode: 'SUGGESTIONS_INLINE',
    });

    const document = response.data;
    const suggestions = findContentSuggestions(document);
    
    if (suggestions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Document "${document.title}" has no suggestions.`,
          },
        ],
        isError: false,
      };
    }

    let result = `Found ${suggestions.length} suggestions in "${document.title}":\n\n`;
    suggestions.forEach((suggestion, index) => {
      result += `${index + 1}. ${suggestion}\n`;
    });

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting suggestions: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Search for suggestions in document content
function findContentSuggestions(document: any): string[] {
  const suggestions: string[] = [];
  
  if (!document.body?.content) {
    return suggestions;
  }

  // Check document-level suggestions
  if (document.suggestedNamedStylesChanges) {
    Object.keys(document.suggestedNamedStylesChanges).forEach(changeId => {
      suggestions.push(`Named style suggestion (ID: ${changeId})`);
    });
  }

  if (document.suggestedDocumentStyleChanges) {
    Object.keys(document.suggestedDocumentStyleChanges).forEach(changeId => {
      suggestions.push(`Document style suggestion (ID: ${changeId})`);
    });
  }

  // Search content recursively
  function searchContent(content: any[], path: string = "") {
    content.forEach((element, index) => {
      const currentPath = path ? `${path}[${index}]` : `[${index}]`;
      
      if (element.paragraph) {
        const para = element.paragraph;
        
        // Check paragraph style suggestions
        if (para.paragraphStyle?.suggestedParagraphStyleChanges) {
          Object.keys(para.paragraphStyle.suggestedParagraphStyleChanges).forEach(changeId => {
            suggestions.push(`Paragraph style suggestion at ${currentPath} (ID: ${changeId})`);
          });
        }

        // Check text run suggestions
        if (para.elements) {
          para.elements.forEach((elem: any, elemIndex: number) => {
            if (elem.textRun) {
              const elemPath = `${currentPath}.elements[${elemIndex}]`;
              
              if (elem.textRun.suggestedInsertionIds?.length > 0) {
                elem.textRun.suggestedInsertionIds.forEach((id: string) => {
                  suggestions.push(`Text insertion at ${elemPath}: "${elem.textRun.content?.trim()}" (ID: ${id})`);
                });
              }
              
              if (elem.textRun.suggestedDeletionIds?.length > 0) {
                elem.textRun.suggestedDeletionIds.forEach((id: string) => {
                  suggestions.push(`Text deletion at ${elemPath}: "${elem.textRun.content?.trim()}" (ID: ${id})`);
                });
              }
              
              if (elem.textRun.textStyle?.suggestedTextStyleChanges) {
                Object.keys(elem.textRun.textStyle.suggestedTextStyleChanges).forEach(changeId => {
                  suggestions.push(`Text style suggestion at ${elemPath} (ID: ${changeId})`);
                });
              }
            }
          });
        }
      }
      
      // Check table suggestions recursively
      if (element.table) {
        element.table.tableRows?.forEach((row: any, rowIndex: number) => {
          row.tableCells?.forEach((cell: any, cellIndex: number) => {
            if (cell.content) {
              searchContent(cell.content, `${currentPath}.table[${rowIndex}][${cellIndex}]`);
            }
          });
        });
      }
    });
  }

  searchContent(document.body.content);
  return suggestions;
}