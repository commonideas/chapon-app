import {useState, useCallback} from 'react';
import {useNavigate} from '@remix-run/react';
import {parseGid} from '@shopify/admin-graphql-api-utilities';
import {
  EmptySearchResult,
  IndexFilters,
  IndexTable,
  Text,
} from '@shopify/polaris';
import type {SelectionType} from '@shopify/polaris/build/ts/src/utilities/use-index-resource-state';
import {useTranslation} from 'react-i18next';
import {StatusBadge} from '~/components';
import {useDeliveryFrequencyFormatter, useProductCountFormatter} from '~/hooks';
import {
  SubscriptionContractStatus,
  type SubscriptionContractListItem,
} from '~/types/contracts';
import {useContractListState} from '../../hooks/useContractListState';
import styles from './ContractsTable.module.css';
import {formatStatus, hasInventoryError} from '~/utils/helpers/contracts';
import {formatPrice} from '~/utils/helpers/money';
import {BulkActionModal} from './components/PauseBulkActionModal/BulkActionModal';
import {InventoryErrorPopover} from './components/InventoryErrorPopover/InventoryErrorPopover';

export interface ContractsTableProps {
  contracts: SubscriptionContractListItem[];
  hasContractsWithInventoryError: boolean;
  selectedResources: string[];
  allResourcesSelected: boolean;
  clearSelection: () => void;
  handleSelectionChange: (
    selectionType: SelectionType,
    isSelecting: boolean,
    selection?: string | [number, number],
  ) => void;
}

export function ContractsTable({
  contracts,
  hasContractsWithInventoryError,
  selectedResources,
  allResourcesSelected,
  clearSelection,
  handleSelectionChange,
}: ContractsTableProps) {
  const {t, i18n} = useTranslation('app.contracts');
  const locale = i18n.language;
  const navigate = useNavigate();
  const productCountFormatter = useProductCountFormatter();
  const {deliveryFrequencyText} = useDeliveryFrequencyFormatter();
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const closePauseModal = useCallback(() => {
    setPauseModalOpen(false);
    clearSelection();
  }, [setPauseModalOpen, clearSelection]);
  const closeActivateModal = useCallback(() => {
    setActivateModalOpen(false);
    clearSelection();
  }, [setActivateModalOpen, clearSelection]);
  const closeCancelModal = useCallback(() => {
    setCancelModalOpen(false);
    clearSelection();
  }, [setCancelModalOpen, clearSelection]);

  const {
    filtersMode,
    setFiltersMode,
    selectedTab,
    selectedTabKey,
    handleTabSelect,
    tabs,
    listLoading,
    sortOptions,
    onSort,
    sortSelected,
  } = useContractListState(hasContractsWithInventoryError);

  let pausable = false,
    resumable = false,
    cancellable = false;
  selectedResources.forEach((contractId) => {
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) return;

    if (contract.status !== SubscriptionContractStatus.Cancelled) {
      cancellable = true;

      if (contract.status !== SubscriptionContractStatus.Paused) {
        pausable = true;
      }
      if (contract.status === SubscriptionContractStatus.Paused) {
        resumable = true;
      }
    }
  });

  const bulkActions = [
    {
      content: t('table.bulkActions.pause', {
        count: selectedResources.length,
      }),
      onAction: () => setPauseModalOpen(true),
      disabled: !pausable,
    },
    {
      content: t('table.bulkActions.activate', {
        count: selectedResources.length,
      }),
      onAction: () => setActivateModalOpen(true),
      disabled: !resumable,
    },
    {
      content: t('table.bulkActions.cancel', {
        count: selectedResources.length,
      }),
      onAction: () => setCancelModalOpen(true),
      disabled: !cancellable,
    },
  ];

  const emptyStateMarkup = (
    <EmptySearchResult
      title={t('table.emptyState.title')}
      description={t('table.emptyState.description', {
        status: t(`table.tabs.${selectedTabKey}`),
      })}
      withIllustration
    />
  );

  const contractRowsMarkup = contracts?.map((contract, index) => {
    return (
      <IndexTable.Row
        key={contract.id}
        id={contract.id}
        position={index}
        selected={selectedResources.includes(contract.id)}
        onClick={() => navigate(`/app/contracts/${parseGid(contract.id)}`)}
      >
        <IndexTable.Cell className={styles.Underline}>
          <Text fontWeight="bold" as="span">
            {parseGid(contract.id)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {hasInventoryError(contract) ? (
            <InventoryErrorPopover
              insufficientStockProductVariants={
                contract.billingAttempts[0]?.processingError
                  ?.insufficientStockProductVariants
              }
            />
          ) : null}
        </IndexTable.Cell>
        <IndexTable.Cell>{contract.customer?.displayName}</IndexTable.Cell>
        <IndexTable.Cell>
          {productCountFormatter(contract.lines, contract.lineCount)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {formatPrice({
            amount: contract.totalPrice?.amount,
            currency: contract.totalPrice?.currencyCode,
            locale,
          })}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {deliveryFrequencyText(contract.deliveryPolicy)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <StatusBadge status={formatStatus(contract.status)} />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const omitSelectedResourcesByStatus = (status: string) => {
    return selectedResources.filter((contractId) =>
      contracts.some((c) => c.id === contractId && c.status !== status),
    );
  };

  return (
    <>
      <IndexFilters
        loading={listLoading}
        tabs={tabs}
        selected={selectedTab}
        onSelect={(selectedTabIndex) => handleTabSelect(selectedTabIndex)}
        mode={filtersMode}
        setMode={setFiltersMode}
        sortOptions={sortOptions}
        onSort={onSort}
        sortSelected={sortSelected}
        onQueryChange={() => {}}
        onQueryClear={() => {}}
        cancelAction={{
          onAction: () => {},
          disabled: false,
          loading: false,
        }}
        canCreateNewView={false}
        filters={[]}
        onClearAll={() => {}}
        hideFilters
        hideQueryField
      />
      <IndexTable
        resourceName={{
          singular: t('table.resourceName.singular'),
          plural: t('table.resourceName.plural'),
        }}
        itemCount={contracts?.length}
        headings={[
          {title: t('table.headings.contract')},
          {title: t('table.headings.warning'), hidden: true},
          {title: t('table.headings.customer')},
          {title: t('table.headings.product')},
          {title: t('table.headings.price')},
          {title: t('table.headings.deliveryFrequency')},
          {title: t('table.headings.status')},
        ]}
        selectedItemsCount={
          allResourcesSelected ? 'All' : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        emptyState={emptyStateMarkup}
        promotedBulkActions={bulkActions}
      >
        {contractRowsMarkup}
      </IndexTable>
      <BulkActionModal
        selectedResources={omitSelectedResourcesByStatus(
          SubscriptionContractStatus.Paused,
        )}
        open={pauseModalOpen}
        action="bulk-pause"
        closeModal={closePauseModal}
      />
      <BulkActionModal
        selectedResources={omitSelectedResourcesByStatus(
          SubscriptionContractStatus.Active,
        )}
        open={activateModalOpen}
        action="bulk-activate"
        closeModal={closeActivateModal}
      />
      <BulkActionModal
        selectedResources={omitSelectedResourcesByStatus(
          SubscriptionContractStatus.Cancelled,
        )}
        open={cancelModalOpen}
        action="bulk-cancel"
        closeModal={closeCancelModal}
      />
    </>
  );
}
