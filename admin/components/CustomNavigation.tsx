import { NavigationContainer, ListNavItems, NavItem } from '@keystone-6/core/admin-ui/components';
import type { NavigationProps } from '@keystone-6/core/admin-ui/components';
export function CustomNavigation({ lists, authenticatedItem }: NavigationProps) {
    return (
        <NavigationContainer authenticatedItem={authenticatedItem}>
            <NavItem href="/">Dashboard</NavItem>
            <NavItem href="/fetch-products">Product Import</NavItem>
            <ListNavItems lists={lists} />
        </NavigationContainer>
    )
} 