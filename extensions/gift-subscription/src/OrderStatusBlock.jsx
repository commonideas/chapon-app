import {
  BlockStack,
  reactExtension,
  TextBlock,
  Banner,
  useApi,
  ResourceItem,
  Button,
   View,
   Card,
  Grid,
    Heading,
  Text,
  useShop,
Link,
Modal,
Image,
Icon
} from "@shopify/ui-extensions-react/customer-account";
import { Badge, InlineLayout, InlineStack, Spinner } from "@shopify/ui-extensions/checkout";


import React, { useEffect, useState } from "react";
export default reactExtension(
  "customer-account.page.render",
  () => <GiftSubscription />
);

function GiftSubscription() {
  const { i18n,query, ui } = useApi();
  const [subscriptionData, setSubscriptionData] = useState([]);
  const [loading, setLoading] = useState(true); 
  const[shop,setShop]= useState("");
  const[customerId,setCustomerId]=useState("");
  const [loadingAction, setLoadingAction] = useState({ id: null, label: null });
const getCustomerNameQuery = {
  query: `query {
    customer {
      firstName
      id
metafields(identifiers: [
      { namespace: "custom", key: "subscription_data" }
    ]) {
    
      value
 
    }
      
    }
  }`
};



const fetchSubscriptions = async () => {

try {
      const response = await fetch("shopify://customer-account/api/unstable/graphql.json", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(getCustomerNameQuery),
      });

      const { data: { customer } } = await response.json();
      const { firstName, id, metafields } = customer;
console.log("Customer ID:", id);
      console.log("Customer Name:", metafields[0].value);
     const subscriptionMetafield = metafields.find(
        (m) => m.namespace === "custom" && m.key === "subscription_data"
      );

   if (metafields[0].value) {
        const parsedValue = JSON.parse(metafields[0].value);
        console.log("Parsed Subscription Data:", parsedValue);
        setSubscriptionData(parsedValue); // 👈 Assuming you have this state declared
      }
setLoading(false); 
    } catch (error) {
      setLoading(false); 
       setSubscriptionData([]);
      console.error("Error fetching customer data:", error);
    }

  }
const getShop = async () => {
  const response = await query(`query {
    shop {
      id
     primaryDomain {
            url
          }
    }
  }`);

      const url = response?.data?.shop?.primaryDomain?.url?.replace(
        "https://",
        ""
      );
      setShop(url);
      console.log("Shop URL:", url);
};
  
  useEffect(() => {
  const fetchCustomerData = async () => {
    setLoading(true); 
    try {
      const response = await fetch("shopify://customer-account/api/unstable/graphql.json", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(getCustomerNameQuery),
      });

      const { data: { customer } } = await response.json();
      const { firstName, id, metafields } = customer;
     
     console.log("Customer ID:", id);
     const subscriptionMetafield = metafields.find(
        (m) => m.namespace === "custom" && m.key === "subscription_data"
      );
 setCustomerId(id);
   if (metafields[0].value) {
        const parsedValue = JSON.parse(metafields[0].value);
        console.log("Parsed Subscription Data:", parsedValue);
        setSubscriptionData(parsedValue); // 👈 Assuming you have this state declared
      }
setLoading(false); 
    } catch (error) {
      setLoading(false); 
       setSubscriptionData([]);
      console.error("Error fetching customer data:", error);
    }
  };

  fetchCustomerData();
  console.log("Fetching shop data...");
  getShop();
}, []);
const getBadgeAppearance = (status) => {
  switch (status.toLowerCase()) {
    case 'active':
      return 'default';
    case 'paused':
      return 'subdued';
    case 'cancelled':
      return 'critical';
    default:
      return 'default';
  }
};
const handleAction = async (action, subscriptionId, customerId) => {
  console.log(`Action: ${action}, Subscription ID: ${subscriptionId}, Customer ID: ${customerId}`);

  setLoadingAction({ id: subscriptionId, label: action });

  try {
    let response;
    const query = `?subscriptionId=${encodeURIComponent(subscriptionId)}&customerId=${encodeURIComponent(customerId)}&shop=${shop}`;

    switch (action.toLowerCase()) {
      case 'activate':
        response = await fetch(`https://app.chapon.com/api/subscription${query}&type=active`,  {
          method: "GET",
          mode: "no-cors",
          headers: {
            'Content-Type': 'application/json',
            'mode':"cors"
          },
        });
        break;

      case 'pause':
        response = await fetch(`https://app.chapon.com/api/subscription${query}&type=pause`,  {
          method: "GET",
          mode: "no-cors",
          headers: {
            'Content-Type': 'application/json',
            'mode':"cors"

          },
        });
        break;

      case 'cancel':
        response = await fetch(`https://app.chapon.com/api/subscription${query}&type=cancel`,  {
          method: "GET",
          mode: "no-cors",
          headers: {
            'Content-Type': 'application/json',
            'mode':"cors"

          },
        });
        break;

      default:
        console.warn('Unknown action:', action);
        return;
    }

    const result = await response.json();
    console.log('Action result:', result);

    if (!response.ok) {
      throw new Error(result.error || 'Something went wrong');
    }
  //  setSubscriptionData(result.updatedValue)
    console.log('Action successful:', result);
    await fetchSubscriptions(); // Refresh your data
  } catch (error) {
     setLoadingAction({ id: null, label: null });
    console.error('Action failed:', error.message);
      await fetchSubscriptions(); // Refresh your data
  } finally {
    setLoadingAction({ id: null, label: null });
      await fetchSubscriptions(); // Refresh your data
  }
};



function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
const formatDate = (isoDate) => {
  const date = new Date(isoDate);
   return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};
const getActionsForStatus = (status) => {
  switch (status.toLowerCase()) {
    case 'active':
      return ['Pause', 'Cancel'];
    case 'pause':
      return ['Activate', 'Cancel'];
    case 'cancel':
      return ['Activate'];
    default:
      return [];
  }
};
const getButtonAppearance = (label) => {
  switch (label.toLowerCase()) {
    case 'cancel':
      return 'info';
    case 'pause':
      return 'success';
    case 'activate':
      return 'success';
    default:
      return 'default';
  }
};
const getButtonKind= (label) => {
  switch (label.toLowerCase()) {
    case 'cancel':
      return 'secondary';
    case 'pause':
      return 'primary';
    case 'active':
      return 'primary';
    default:
      return 'default';
  }
};
  return (
  <BlockStack spacing="base">
  {loading ? (
    <BlockStack inlineAlignment="center">
      <Text size="medium">Loading Abonnement...</Text>
      <Spinner />
    </BlockStack>
  ) : (
    <BlockStack spacing="base">
      <Heading>Abonnement cadeau</Heading>

      {subscriptionData.length === 0 ? (
        <View border="base" padding="base" blockAlignment="center" inlineAlignment="center">
          Il n'y a pas d'abonnement actif.
        </View>
      ) : (
        <Grid columns={['1fr', '1fr', '1fr']} spacing="base">
          {subscriptionData.map((sub, i) => (
            <Card key={i} padding>
              <BlockStack spacing="base">
              <View background ="subdued" cornerRadius="base" padding="base">
                <BlockStack spacing="tight">
               
                    <BlockStack gap="100">
                     <Text size="medium">{sub.status=="ACTIVE" ?'Actif': sub.status }</Text>
                     
                        <Text size="medium">Prochaine Commande:{formatDate(sub.nextBillingDate)}</Text>
                        </BlockStack>
                   
                  </BlockStack>
         
      </View>
                
               
                   <Image source={sub?.lines?.edges[0].node?.variantImage?.url}/>
              

               

                <TextBlock emphasis="bold">{sub?.lines?.edges[0].node?.title}</TextBlock>
              <InlineLayout spacing="base" columns={['fill', 'fill']}>
                  {getActionsForStatus(sub.status).map((label, i) => {
                    if (label.toLowerCase() === 'cancel') {
                      return (
                        <BlockStack spacing="base">
                        <Link
                          key={i}
                          appearance="monochrome"
                          overlay={
                            <Modal
                              id={`cancel-modal-${sub.id}`}
                              title="Confirm Cancellation"
                              padding
                            >
                              <BlockStack spacing="tight">
                                <TextBlock>
                                  Are you sure you want to cancel this subscription?
                                </TextBlock>
                                <InlineLayout spacing="tight">
                                  <Button
                                    kind="secondary"
                                    onPress={() =>
                                      ui.overlay.close(`cancel-modal-${sub.id}`)
                                    }
                                  >
                                    No
                                  </Button>
                                  <Button
                                    kind="primary"
                                    appearance="critical"
                                    loading={
                                      loadingAction.id === sub.id &&
                                      loadingAction.label === label
                                    }
                                    onPress={async () => {
                                      handleAction(label, sub.id, customerId);
                                      ui.overlay.close(`cancel-modal-${sub.id}`);
                                    }}
                                  >
                                    Yes, Cancel
                                  </Button>
                                </InlineLayout>
                              </BlockStack>
                            </Modal>
                          }
                        >
                          
                          {/* <Button
                            key={i}
                            kind={getButtonKind(label)}
                            size="slim"
                            appearance={getButtonAppearance(label)}
                          > */}
                            {label.toUpperCase()}
                          {/* </Button> */}
                        </Link>
                        </BlockStack>
                      );
                    }

                    return (
                      <BlockStack spacing="base">
                      <Button
                        key={i}
                        kind="secondary"
                        // kind={getButtonKind(label)}
                        
                        size="slim"
                        loading={
                          loadingAction.id === sub.id &&
                          loadingAction.label === label
                        }
                        appearance={getButtonAppearance(label)}
                        onPress={() => handleAction(label, sub.id, customerId)}
                      >
                        {label.toUpperCase()}
                      </Button>
                      </BlockStack>
                    );
                  })}
                </InlineLayout>
        

              </BlockStack>
            </Card>
          ))}
        </Grid>
      )}
    </BlockStack>
  )}
      
</BlockStack>
  );
}