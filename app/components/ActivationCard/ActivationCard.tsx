import { useState, useCallback } from "react";
import { BlockStack, Box, Card, InlineStack, Text, Button, Icon, Tooltip , Toast, Frame} from '@shopify/polaris';
import { ClipboardIcon } from '@shopify/polaris-icons';
import { useTranslation } from 'react-i18next';

export interface ActivationCardProps {
 Code?: string;   
}


export function ActivationCard({ Code }: ActivationCardProps) {
  const { t, i18n } = useTranslation("app.contracts");
  const locale = i18n.language;

  const [toastActive, setToastActive] = useState(false);

  const toggleToast = useCallback(() => setToastActive((active) => !active), []);

  const handleCopy = async () => {
    if (Code) {
      await navigator.clipboard.writeText(Code);
      setToastActive(true);
    }
  };

  return (
    <Frame>
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" fontWeight="semibold">
            Activation code
          </Text>

          <Box
            padding="300"
            borderColor="border"
            borderWidth="025"
            borderRadius="200"
          >
            <InlineStack gap="200" align="space-between" blockAlign="center">
                <Text as="span" variant="bodyMd" fontWeight="medium">
                    {Code}
                </Text>
              <Button
                size="slim"
                icon={ClipboardIcon}
                onClick={handleCopy}
                accessibilityLabel="Copy activation code"
              />
          </InlineStack>
          </Box>
        </BlockStack>
      </Card>

      {toastActive && (
        <Toast content={t("copied", { defaultValue: "Copied!" })} onDismiss={toggleToast} />
      )}
    </Frame>
  );
}